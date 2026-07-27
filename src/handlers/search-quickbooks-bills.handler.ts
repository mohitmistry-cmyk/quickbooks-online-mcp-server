import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { applyEntityClientFilters } from "../helpers/invoice-client-filter.js";

const CLIENT_COMPARISON_OPERATORS = new Set(["<", ">", "<=", ">="]);
const OPTION_FIELDS = new Set(["asc", "desc", "limit", "offset", "count", "fetchAll"]);

/**
 * Search bills from QuickBooks Online.
 *
 * Accepts either:
 *   • A plain criteria object (key/value pairs) – passed directly to findBills
 *   • An **array** of objects in the `{ field, value, operator? }` shape – this
 *     allows use of operators such as `IN`, `LIKE`, `>`, `<`, `>=`, `<=` etc.
 *
 * Pagination / sorting options such as `limit`, `offset`, `asc`, `desc`,
 * `fetchAll`, `count` can be supplied via the top‑level criteria object or as
 * dedicated entries in the array form.
 */
export async function searchQuickbooksBills(criteria: object | Array<Record<string, any>> = {}): Promise<ToolResponse<any[]>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();
    const entries = Array.isArray(criteria) ? criteria : [];
    const clientFilters = entries.filter((entry) =>
      CLIENT_COMPARISON_OPERATORS.has(String(entry?.operator || "").toUpperCase())
    );
    const options = Object.fromEntries(
      entries
        .filter((entry) => OPTION_FIELDS.has(String(entry?.field)))
        .map((entry) => [entry.field, entry.value])
    );
    const qboCriteria = clientFilters.length > 0
      ? [
          ...entries.filter((entry) =>
            !clientFilters.includes(entry) && !OPTION_FIELDS.has(String(entry?.field))
          ),
          { field: "fetchAll", value: true },
        ]
      : criteria;

    return new Promise((resolve) => {
      (quickbooks as any).findBills(qboCriteria as any, (err: any, bills: any) => {
        if (err) {
          resolve({
            result: null,
            isError: true,
            error: formatError(err),
          });
        } else {
          const rows = bills?.QueryResponse?.Bill ?? [];
          resolve({
            result: clientFilters.length > 0
              ? applyEntityClientFilters(rows, clientFilters, options)
              : (
                  bills?.QueryResponse?.Bill ??
                  bills?.QueryResponse?.totalCount ??
                  []
                ),
            isError: false,
            error: null,
          });
        }
      });
    });
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
} 
