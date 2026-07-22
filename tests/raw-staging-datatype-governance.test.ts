import { describe, expect, it } from "vitest";
import {
  applyDataTypeOverrides,
  runEnterpriseAnalysis,
  type ProjectFile,
} from "../src/lib/migration/enterprise-parser";

function qvs(content: string): ProjectFile {
  return { path: "RawJoin.qvs", ext: ".qvs", size: content.length, isText: true, content, note: "" };
}

describe("raw and staging datatype governance", () => {
  it("keeps physical source staging raw and applies overrides in compiled table queries", () => {
    const analysis = runEnterpriseAnalysis([qvs(`
RawSales:
LOAD CustomerID, SalesDate, NetSalesUSD
FROM [Sales.csv];

Customer:
LOAD CustomerID, CustomerName
FROM [Customer.csv];

LEFT JOIN (RawSales)
LOAD CustomerID, CustomerName
RESIDENT Customer;

FinalSales:
LOAD CustomerID, SalesDate, NetSalesUSD, CustomerName
RESIDENT RawSales;
`)]);

    expect(analysis.columnTypes.RawSales).toBeDefined();
    expect(analysis.columnTypes.Customer).toBeDefined();

    const updated = applyDataTypeOverrides(analysis, {
      "RawSales.CustomerID": "Whole Number",
      "Customer.CustomerID": "Whole Number",
    });

    const rawSourceName = Object.keys(updated.stagingQueries || {}).find((name) => name.startsWith("Source_RawSales"));
    const customerSourceName = Object.keys(updated.stagingQueries || {}).find((name) => name.startsWith("Source_Customer"));
    expect(rawSourceName).toBeTruthy();
    expect(customerSourceName).toBeTruthy();
    expect(updated.stagingQueries?.[rawSourceName!]).not.toContain("ReviewedTypeConversions");
    expect(updated.stagingQueries?.[customerSourceName!]).not.toContain("ReviewedTypeConversions");
    expect(updated.mQueries.RawSales).toContain('{"CustomerID", Int64.Type}');
  });

  it("inserts harmonized key conversions before Table.NestedJoin", () => {
    const analysis = runEnterpriseAnalysis([qvs(`
Orders:
LOAD CustomerID, Amount
FROM [Orders.csv];

Customers:
LOAD CustomerID, CustomerName
FROM [Customers.csv];

LEFT JOIN (Orders)
LOAD CustomerID, CustomerName
RESIDENT Customers;
`)]);
    const updated = applyDataTypeOverrides(analysis, {
      "Orders.CustomerID": "Whole Number",
      "Customers.CustomerID": "Text",
    });
    const query = updated.mQueries.Orders;
    expect(query).toContain("Typed_Orders_JoinKeys");
    expect(query).toContain("Typed_Customers_JoinKeys");
    expect(query.indexOf("Typed_Orders_JoinKeys")).toBeLessThan(query.indexOf("Table.NestedJoin"));
  });
});
