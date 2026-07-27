import {
  applyInvoiceClientFilters,
  matchesInvoiceComparison,
} from "../../../src/helpers/invoice-client-filter";

describe("invoice client-side comparison filtering", () => {
  const invoices = [
    { Id: "1", Balance: 250, TotalAmt: 500, DueDate: "2026-07-01" },
    { Id: "2", Balance: 1500, TotalAmt: 1700, DueDate: "2026-06-01" },
    { Id: "3", Balance: 2400, TotalAmt: 2400, DueDate: "2026-08-01" },
  ];

  it("compares numeric values without sending unsupported operators to QBO", () => {
    expect(matchesInvoiceComparison(invoices[1], {
      field: "Balance", operator: ">", value: 1000,
    })).toBe(true);
    expect(matchesInvoiceComparison(invoices[0], {
      field: "Balance", operator: ">", value: 1000,
    })).toBe(false);
  });

  it("filters, sorts, and limits after fetching all invoices", () => {
    expect(applyInvoiceClientFilters(
      invoices,
      [{ field: "Balance", operator: ">", value: 1000 }],
      { desc: "Balance", limit: 1 },
    ).map((invoice) => invoice.Id)).toEqual(["3"]);
  });

  it("supports ISO date comparisons for overdue invoice queries", () => {
    expect(applyInvoiceClientFilters(
      invoices,
      [{ field: "DueDate", operator: "<=", value: "2026-06-15" }],
      {},
    ).map((invoice) => invoice.Id)).toEqual(["2"]);
  });

  it("covers every supported comparison operator and harmless unknown operators", () => {
    expect(matchesInvoiceComparison(invoices[1], {
      field: "Balance", operator: ">=", value: "1500",
    })).toBe(true);
    expect(matchesInvoiceComparison(invoices[0], {
      field: "DueDate", operator: "<", value: "2026-07-02",
    })).toBe(true);
    expect(matchesInvoiceComparison(invoices[0], {
      field: "Missing.Nested", operator: "=", value: "",
    })).toBe(true);
  });

  it("supports ascending sort, offsets, equal values, and defensive pagination", () => {
    const rows = [...invoices, { Id: "4", Balance: 1500, DueDate: "" }];
    expect(applyInvoiceClientFilters(rows, [], {
      asc: "Balance", offset: 1, limit: 2,
    }).map((invoice) => invoice.Id)).toEqual(["2", "4"]);
    expect(applyInvoiceClientFilters(rows, [], {
      offset: -2, limit: -1,
    })).toEqual([]);
    expect(applyInvoiceClientFilters(rows, [], {}).length).toBe(4);
  });
});
