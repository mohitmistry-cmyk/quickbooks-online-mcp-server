import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { formatError } from "../helpers/format-error.js";
import { ToolResponse } from "../types/tool-response.js";
import { AUTOMATION_ENTITY_SUFFIX } from "./lookup-quickbooks-automation-entities.handler.js";

function isObject(value: any): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(current: any, incoming: any): any {
  if (!isObject(current) || !isObject(incoming)) return incoming;
  const merged: Record<string, any> = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    merged[key] = isObject(value) && isObject(current[key])
      ? deepMerge(current[key], value)
      : value;
  }
  return merged;
}

function sparsePatch(current: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [
      key,
      isObject(value) && isObject(current[key])
        ? deepMerge(current[key], value)
        : value,
    ]),
  );
}

function mergeLines(current: any[], incoming: any[], mode: "merge_only" | "exact_mirror"): any[] {
  const currentById = new Map(
    current.filter((line) => line?.Id != null).map((line) => [String(line.Id), line]),
  );
  const incomingIds = new Set(
    incoming.filter((line) => line?.Id != null).map((line) => String(line.Id)),
  );
  const rendered = incoming.map((line) => {
    const existing = line?.Id != null ? currentById.get(String(line.Id)) : undefined;
    return existing ? deepMerge(existing, line) : line;
  });
  if (mode === "exact_mirror") return rendered;
  const structural = current.filter((line) => line?.DetailType === "SubTotalLineDetail");
  const preserved = current.filter(
    (line) => line?.DetailType !== "SubTotalLineDetail"
      && (line?.Id == null || !incomingIds.has(String(line.Id))),
  );
  return [...preserved, ...rendered, ...structural];
}

function invoke(client: any, method: string, ...args: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const fn = client[method];
    if (typeof fn !== "function") {
      reject(new Error(`QuickBooks SDK method ${method} is unavailable.`));
      return;
    }
    fn.call(client, ...args, (error: any, result: any) =>
      error ? reject(error) : resolve(result),
    );
  });
}

export interface UpdateAutomationEntityInput {
  entity_type: string;
  id: string;
  patch: Record<string, any>;
  line_reconciliation?: "merge_only" | "exact_mirror";
}

const SPARSE_REQUIRED_FIELDS: Record<string, string[]> = {
  bill: ["VendorRef"],
  vendor_credit: ["VendorRef", "APAccountRef"],
  deposit: ["DepositToAccountRef"],
  transfer: ["FromAccountRef", "ToAccountRef", "Amount"],
  term: [
    "Type", "DueDays", "DiscountDays", "DiscountPercent",
    "DayOfMonthDue", "DiscountDayOfMonth",
  ],
  purchase: ["PaymentType", "AccountRef"],
};

export async function updateQuickbooksAutomationEntity(
  data: UpdateAutomationEntityInput,
): Promise<ToolResponse<any>> {
  try {
    const suffix = AUTOMATION_ENTITY_SUFFIX[data.entity_type];
    if (!suffix) throw new Error(`Unsupported automation entity type: ${data.entity_type}`);
    const quickbooks: any = await QuickbooksClient.getInstance();
    const current = await invoke(quickbooks, `get${suffix}`, String(data.id));
    if (!current?.Id) throw new Error(`${data.entity_type} ${data.id} was not found.`);
    const patch = { ...(data.patch || {}) };
    if (Array.isArray(patch.Line)) {
      patch.Line = mergeLines(
        Array.isArray(current.Line) ? current.Line : [],
        patch.Line,
        data.line_reconciliation || "merge_only",
      );
    }
    const hasLinePatch = Array.isArray(patch.Line);
    // QBO sparse updates must only include fields that are changing. Re-sending
    // the complete fetched transaction can fail when QBO omits a required line
    // reference from its own read response (Bill ItemRef is one example).
    const requiredSparseFields = Object.fromEntries(
      (SPARSE_REQUIRED_FIELDS[data.entity_type] || [])
        .filter((key) => current[key] != null)
        .map((key) => [key, current[key]]),
    );
    const payload = hasLinePatch
      ? {
          ...deepMerge(current, patch),
          Id: current.Id,
          SyncToken: current.SyncToken,
          sparse: false,
        }
      : {
          ...requiredSparseFields,
          ...sparsePatch(current, patch),
          Id: current.Id,
          SyncToken: current.SyncToken,
          sparse: true,
        };
    const updated = await invoke(quickbooks, `update${suffix}`, payload);
    return { result: updated, isError: false, error: null };
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
