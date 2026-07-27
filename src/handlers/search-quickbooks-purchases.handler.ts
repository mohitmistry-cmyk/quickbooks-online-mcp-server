import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { buildQuickbooksSearchCriteria } from "../helpers/build-quickbooks-search-criteria.js";
import { applyEntityClientFilters } from "../helpers/invoice-client-filter.js";

const CLIENT_COMPARISON_OPERATORS = new Set(["<", ">", "<=", ">="]);

/**
 * Search purchases in QuickBooks Online that match given criteria
 */
export async function searchQuickbooksPurchases(params: any): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    const filters = Array.isArray(params?.criteria) ? params.criteria : [];
    const clientFilters = filters.filter((filter: any) =>
      CLIENT_COMPARISON_OPERATORS.has(String(filter?.operator || "").toUpperCase())
    );
    const criteria = clientFilters.length > 0
      ? buildQuickbooksSearchCriteria({
          criteria: filters.filter((filter: any) => !clientFilters.includes(filter)),
          fetchAll: true,
        })
      : buildQuickbooksSearchCriteria(params);

    return new Promise((resolve) => {
      quickbooks.findPurchases(criteria, (err: any, purchases: any) => {
        if (err) {
          resolve({
            result: null,
            isError: true,
            error: formatError(err),
          });
        } else {
          const rows = purchases?.QueryResponse?.Purchase || [];
          resolve({
            result: clientFilters.length > 0
              ? applyEntityClientFilters(rows, clientFilters, params)
              : rows,
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
