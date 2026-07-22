import { describe, expect, it } from "vitest";
import { applyDataTypeOverrides, buildPowerQueryReviews, runEnterpriseAnalysis, type ProjectFile } from "../src/lib/migration/enterprise-parser";

function file(content: string): ProjectFile { return { path: "LoadScript.qvs", ext: ".qvs", size: content.length, isText: true, content, note: "" }; }

describe("Power Query safety", () => {
  it("uses authoritative reviewed types at the final M step", () => {
    const result = applyDataTypeOverrides(runEnterpriseAnalysis([file("Sales: LOAD OrderDate, Quantity FROM [Sales.csv];")]), { "Sales.OrderDate": "Date", "Sales.Quantity": "Whole Number" });
    expect(result.mQueries.Sales).toContain("ReviewedTypeConversions");
    expect(result.mQueries.Sales).toContain('Date.From(_)');
    expect(result.mQueries.Sales).toContain('Int64.From(_)');
    expect(result.columnTypeMeta.Sales.OrderDate.source).toBe("User override");
  });

  it("uses add-or-replace and collision-safe join expansion", () => {
    const result = runEnterpriseAnalysis([file(`
Customers:
LOAD CustomerID, CustomerName, Region FROM [Customers.csv];
Sales:
LOAD CustomerID, CustomerName, Amount FROM [Sales.csv];
LEFT JOIN (Sales)
LOAD CustomerID, CustomerName, Region RESIDENT Customers;
LEFT JOIN (Sales)
LOAD CustomerID, CustomerName, Region RESIDENT Customers;
Sales2:
LOAD CustomerID, CustomerName, if(Amount>0,'Y','N') as CustomerName RESIDENT Sales;
`)]);
    expect(result.mQueries.Sales2).toContain("__QLIK2PBI_CustomerName_VALUE");
    expect(result.mQueries.Sales2).toContain("Table.RemoveColumns");
    expect(result.mQueries.Sales2).toContain("Table.RenameColumns");
    expect(result.mQueries.Sales).toContain("QLIK2PBI COLLISION SAFE EXPANSION");
    expect(result.mQueries.Sales).toContain("List.Difference");
    expect((result.mQueries.Sales.match(/Table\.NestedJoin/g) || []).length).toBe(1);
  });

  it("ignores Qlik words inside M strings, comments and diagnostic metadata", () => {
    const safeQuery = `let
  Source = #table({"Value"}, {{1}}),
  Checked = if Table.RowCount(Source) > 0 then Source else error Error.Record("X", "The Qlik Peek/Min calendar source contains no valid date.", [OriginalExpression="Peek('MinDate',0,'TempDate')"])
in
  Checked`;
    const reviews = buildPowerQueryReviews({ Calendar: safeQuery }, {}, {});
    expect(reviews.Calendar.issues.some((issue) => issue.category === "qlik-syntax")).toBe(false);

    const unsafeQuery = `let
  Value = Peek("MinDate", 0, "TempDate")
in
  Value`;
    const unsafeReviews = buildPowerQueryReviews({ Calendar: unsafeQuery }, {}, {});
    expect(unsafeReviews.Calendar.issues.some((issue) => issue.category === "qlik-syntax")).toBe(true);
  });

  it("classifies runtime-only and manual-review Qlik logic", () => {
    const result = runEnterpriseAnalysis([file(`SET DateFormat='DD/MM/YYYY'; TRACE starting; SECTION ACCESS; STORE Sales INTO Sales.qvd;`)]);
    expect(result.logicDecisions.some((item) => item.action === "ignore-runtime")).toBe(true);
    expect(result.logicDecisions.some((item) => item.action === "manual-review" && item.blocking)).toBe(true);
    expect(result.logicDecisions.some((item) => item.category === "Environment formatting")).toBe(true);
  });
});
