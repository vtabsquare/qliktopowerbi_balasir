import { describe, expect, it } from "vitest";
import type { Operation } from "../src/lib/migration/enterprise-parser";
import { QlikTableStateSimulator } from "../src/lib/migration/reconstruction/QlikTableStateSimulator";

function op(partial: Partial<Operation>): Operation {
  return {
    id: partial.id || "OP",
    table: partial.table || "T",
    opType: partial.opType || "load",
    role: "",
    file: "test.qvs",
    startLine: 1,
    endLine: 1,
    raw: partial.raw || "",
    resolvedRaw: partial.raw || "",
    fields: partial.fields || [],
    calculatedFields: [],
    fieldExpressions: partial.fieldExpressions || {},
    sourceRefs: partial.sourceRefs || [],
    resident: partial.resident || [],
    qvdInputs: [], qvdOutputs: [], inlineColumns: partial.inlineColumns || [], inlineRows: [],
    where: "", groupBy: [], joinTarget: partial.joinTarget || "", concatTarget: "",
    applymaps: [], aggregations: [], warnings: [],
  };
}

describe("QlikTableStateSimulator", () => {
  it("expands LOAD star from the exact resident snapshot and keeps payload out of pre-join state", () => {
    const operations = [
      op({ id: "1", table: "FactSales_Base", fields: ["SalesID", "ProductID", "CustomerID", "SalesAmount"] }),
      op({ id: "2", table: "FactSales_Enriched", fields: ["*", "MarginPct"], resident: ["FactSales_Base"], raw: "LOAD *, ... RESIDENT FactSales_Base" }),
      op({ id: "3", table: "DimProduct", fields: ["ProductID", "Category", "SubCategory", "SupplierID"] }),
      op({ id: "4", table: "JoinPayload", opType: "join_load", joinTarget: "FactSales_Enriched", resident: ["DimProduct"], fields: ["ProductID", "Category", "SubCategory", "SupplierID"] }),
    ];
    const simulator = new QlikTableStateSimulator(operations);
    expect(simulator.getStateBefore("FactSales_Enriched", 3)?.columns).toEqual([
      "SalesID", "ProductID", "CustomerID", "SalesAmount", "MarginPct",
    ]);
    expect(simulator.getSourceProjection(operations[3], 3)).toEqual([
      "ProductID", "Category", "SubCategory", "SupplierID",
    ]);
    expect(simulator.getStateAfter("FactSales_Enriched", 3)?.columns).toEqual([
      "SalesID", "ProductID", "CustomerID", "SalesAmount", "MarginPct", "Category", "SubCategory", "SupplierID",
    ]);
  });
});
