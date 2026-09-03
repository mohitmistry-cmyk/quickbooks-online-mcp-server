import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { formatError } from "../helpers/format-error.js";
import { ToolResponse } from "../types/tool-response.js";

export const AUTOMATION_ENTITY_SUFFIX: Record<string, string> = {
  account: "Account", attachable: "Attachable", bill_payment: "BillPayment",
  bill: "Bill", class: "Class", credit_memo: "CreditMemo", customer: "Customer",
  department: "Department", deposit: "Deposit", employee: "Employee",
  estimate: "Estimate", invoice: "Invoice", item: "Item",
  journal_entry: "JournalEntry", payment_method: "PaymentMethod", payment: "Payment",
  purchase_order: "PurchaseOrder", purchase: "Purchase", refund_receipt: "RefundReceipt",
  sales_receipt: "SalesReceipt", term: "Term", time_activity: "TimeActivity",
  transfer: "Transfer", vendor_credit: "VendorCredit", vendor: "Vendor",
};

const FIND_METHOD_OVERRIDES: Record<string, string> = {
  class: "findClasses",
  journal_entry: "findJournalEntries",
  time_activity: "findTimeActivities",
};

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

export async function lookupQuickbooksAutomationEntities(
  entityType: string,
  id?: string,
): Promise<ToolResponse<any[]>> {
  try {
    const suffix = AUTOMATION_ENTITY_SUFFIX[entityType];
    if (!suffix) throw new Error(`Unsupported automation entity type: ${entityType}`);
    const quickbooks: any = await QuickbooksClient.getInstance();
    if (id) {
      const entity = await invoke(quickbooks, `get${suffix}`, String(id));
      return { result: entity?.Id ? [entity] : [], isError: false, error: null };
    }
    const response = await invoke(
      quickbooks,
      FIND_METHOD_OVERRIDES[entityType] || `find${suffix}s`,
      { fetchAll: true },
    );
    const queryResponse = response?.QueryResponse || {};
    const rows = queryResponse[suffix];
    return {
      result: Array.isArray(rows) ? rows : [],
      isError: false,
      error: null,
    };
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
