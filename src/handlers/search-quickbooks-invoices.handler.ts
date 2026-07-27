import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import {
  AdvancedQuickbooksSearchOptions,
  buildQuickbooksSearchCriteria,
  QuickbooksSearchCriteriaInput,
} from "../helpers/build-quickbooks-search-criteria.js";
import { applyInvoiceClientFilters } from "../helpers/invoice-client-filter.js";

export type InvoiceSearchCriteria = QuickbooksSearchCriteriaInput;

const CLIENT_COMPARISON_OPERATORS = new Set(["<", ">", "<=", ">="]);
const OPTION_FIELDS = new Set(["asc", "desc", "limit", "offset", "count", "fetchAll"]);

/**
 * Search for invoices in QuickBooks Online using criteria supported by node-quickbooks findInvoices.
 * QBO's Invoice query endpoint rejects range operators for fields such as Balance
 * even though they are useful search semantics. Those filters are evaluated after
 * fetching the matching invoice set, while equality/IN/LIKE remain server-side.
 */
export async function searchQuickbooksInvoices(criteria: InvoiceSearchCriteria): Promise<ToolResponse<any[]>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();
    const entries = Array.isArray(criteria) ? criteria : [];
    const options: AdvancedQuickbooksSearchOptions = entries.length > 0
      ? Object.fromEntries(
          entries
            .filter((entry) => OPTION_FIELDS.has(String(entry?.field)))
            .map((entry) => [entry.field, entry.value])
        )
      : (
          criteria && typeof criteria === "object"
            ? criteria as AdvancedQuickbooksSearchOptions
            : {}
        );
    const filters = entries.length > 0
      ? entries.filter((entry) => !OPTION_FIELDS.has(String(entry?.field)))
      : (options.filters ?? options.criteria ?? []);
    const clientFilters = filters.filter((filter) =>
      CLIENT_COMPARISON_OPERATORS.has(String(filter.operator || "").toUpperCase())
    );
    let normalizedCriteria;
    if (clientFilters.length > 0) {
      normalizedCriteria = buildQuickbooksSearchCriteria({
        filters: filters.filter((filter) => !clientFilters.includes(filter)),
        fetchAll: true,
      });
    } else {
      normalizedCriteria = buildQuickbooksSearchCriteria(criteria);
    }

    return new Promise((resolve) => {
      (quickbooks as any).findInvoices(normalizedCriteria, (err: any, invoices: any) => {
        if (err) {
          resolve({ result: null, isError: true, error: formatError(err) });
        } else {
          const rows = invoices.QueryResponse.Invoice || [];
          resolve({
            result: clientFilters.length > 0
              ? applyInvoiceClientFilters(rows, clientFilters, options)
              : rows,
            isError: false,
            error: null,
          });
        }
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
} 
