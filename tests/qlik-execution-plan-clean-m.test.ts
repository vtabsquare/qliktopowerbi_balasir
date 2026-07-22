import { describe, expect, it } from "vitest";
import { runEnterpriseAnalysis, type ProjectFile } from "@/lib/migration/enterprise-parser";

const file = (path: string, ext: string, content: string): ProjectFile => ({ path, ext, size: content.length, isText: true, content, note: "" });

describe("Qlik-first execution planning and clean M generation", () => {
  it("keeps dimension transformations in helper queries and separates join keys from payload", () => {
    const script = `
DimCustomer:
LOAD CustomerID, Segment, City, CustomerStatus FROM [customers.csv];

FactSales_Enriched:
LOAD SalesID, CustomerID, ProductID, SalesAmount FROM [sales.csv];

LEFT JOIN (FactSales_Enriched)
LOAD CustomerID, Segment, City, CustomerStatus RESIDENT DimCustomer;

FactSales_Final:
NOCONCATENATE LOAD * RESIDENT FactSales_Enriched;
`;
    const analysis = runEnterpriseAnalysis([
      file("model.qvs", ".qvs", script),
      file("customers.csv", ".csv", "CustomerID,Segment,City,CustomerStatus\nC1,SMB,Chennai,Active\n"),
      file("sales.csv", ".csv", "SalesID,CustomerID,ProductID,SalesAmount\nS1,C1,P1,100\n"),
    ]);
    const query = analysis.mQueries.FactSales_Final;
    const helper = Object.keys(analysis.stagingQueries || {}).find((name) => name.startsWith("JoinPayload_"));
    expect(helper).toBeTruthy();
    expect(query).toContain(`#"${helper}"`);
    expect(query).not.toContain("Calculated_CustomerStatus");
    expect(query).toContain('Table.NestedJoin');
    const join = analysis.executionPlans.FactSales_Final.joins[0];
    expect(join.leftKeys).toEqual(["CustomerID"]);
    expect(join.expandColumns).toEqual(expect.arrayContaining(["Segment", "City", "CustomerStatus"]));
    expect(join.expandColumns).not.toContain("CustomerID");
  });
});
