import {
  AdvancedQuickbooksSearchOptions,
  QuickbooksFilter,
} from "./build-quickbooks-search-criteria.js";

function valueAtPath(row: Record<string, any>, path: string): any {
  return path.split(".").reduce((value, part) => value?.[part], row);
}

function comparable(value: any): number | string {
  if (typeof value === "number") return value;
  const numeric = Number(value);
  if (value !== "" && Number.isFinite(numeric)) return numeric;
  return String(value ?? "");
}

export function matchesInvoiceComparison(invoice: Record<string, any>, filter: QuickbooksFilter): boolean {
  const left = comparable(valueAtPath(invoice, filter.field));
  const right = comparable(filter.value);
  switch (filter.operator) {
    case ">": return left > right;
    case ">=": return left >= right;
    case "<": return left < right;
    case "<=": return left <= right;
    default: return true;
  }
}

export function applyEntityClientFilters(
  rows: any[],
  filters: QuickbooksFilter[],
  options: AdvancedQuickbooksSearchOptions,
): any[] {
  let result = rows.filter((row) =>
    filters.every((filter) => matchesInvoiceComparison(row, filter))
  );
  const sortField = options.desc || options.asc;
  if (sortField) {
    const direction = options.desc ? -1 : 1;
    result = [...result].sort((a, b) => {
      const left = comparable(valueAtPath(a, sortField));
      const right = comparable(valueAtPath(b, sortField));
      return left < right ? -direction : left > right ? direction : 0;
    });
  }
  const offset = Math.max(options.offset || 0, 0);
  const end = typeof options.limit === "number" ? offset + Math.max(options.limit, 0) : undefined;
  return result.slice(offset, end);
}

export const applyInvoiceClientFilters = applyEntityClientFilters;
