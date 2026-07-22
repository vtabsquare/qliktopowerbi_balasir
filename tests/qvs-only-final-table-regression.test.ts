import { describe, expect, it } from "vitest";
import { runEnterpriseAnalysis, type ProjectFile } from "@/lib/migration/enterprise-parser";

const qvs = `
LET vSourcePath='D:\\SourceFiles\\';
LET vQVDPath='D:\\SourceFiles\\QVD\\';
Customers_Stg:
LOAD CustomerID, CustomerName, Segment, Industry, Status, EmailDomain
FROM [$(vSourcePath)Customers.csv] (txt, utf8, embedded labels, delimiter is ',');
STORE Customers_Stg INTO [$(vQVDPath)Staging\\Customers.qvd] (qvd);
DROP TABLE Customers_Stg;
Customer_Attributes_Stg:
LOAD CustomerID, CreditLimitUSD, RiskBand, PaymentTerms, LoyaltyTier, AccountManager, DigitalAdoptionFlag
FROM [$(vSourcePath)Customer_Attributes.csv] (txt, utf8, embedded labels, delimiter is ',');
STORE Customer_Attributes_Stg INTO [$(vQVDPath)Staging\\Customer_Attributes.qvd] (qvd);
DROP TABLE Customer_Attributes_Stg;
Sales2025_Stg:
LOAD SalesID, OrderDate, CustomerID, ProductID, RegionID, CurrencyCode, Quantity, UnitPriceUSD, DiscountPct, RevenueUSD, CostUSD, SalesChannel, OrderStatus, SalesRep
FROM [$(vSourcePath)Sales_2025.csv] (txt, utf8, embedded labels, delimiter is ',');
STORE Sales2025_Stg INTO [$(vQVDPath)Staging\\Sales2025.qvd] (qvd);
DROP TABLE Sales2025_Stg;
Sales2026_Stg:
LOAD SalesID, OrderDate, CustomerID, ProductID, RegionID, CurrencyCode, Quantity, UnitPriceUSD, DiscountPct, RevenueUSD, CostUSD, SalesChannel, OrderStatus, SalesRep
FROM [$(vSourcePath)Sales_2026.csv] (txt, utf8, embedded labels, delimiter is ',');
STORE Sales2026_Stg INTO [$(vQVDPath)Staging\\Sales2026.qvd] (qvd);
DROP TABLE Sales2026_Stg;
RegionMap:
MAPPING LOAD RegionID, RegionName INLINE [RegionID,RegionName\n1,North];
FactSales:
LOAD * FROM [$(vQVDPath)Staging\\Sales2025.qvd] (qvd);
CONCATENATE (FactSales)
LOAD * FROM [$(vQVDPath)Staging\\Sales2026.qvd] (qvd);
FactSales_Map:
LOAD *, ApplyMap('RegionMap', RegionID, 'Unknown Region') AS SalesRegionName
RESIDENT FactSales;
DROP TABLE FactSales;
LEFT JOIN (FactSales_Map)
LOAD CustomerID, CustomerName, Segment, Industry, Status, EmailDomain
FROM [$(vQVDPath)Staging\\Customers.qvd] (qvd);
LEFT JOIN (FactSales_Map)
LOAD CustomerID, CreditLimitUSD, RiskBand, PaymentTerms, LoyaltyTier, AccountManager, DigitalAdoptionFlag
FROM [$(vQVDPath)Staging\\Customer_Attributes.qvd] (qvd);
FactSales_Final:
LOAD *, RevenueUSD - CostUSD AS ProfitUSD,
IF(RevenueUSD > 10000, 'High', IF(RevenueUSD > 5000, 'Medium', 'Low')) AS SalesBand
RESIDENT FactSales_Map;
DROP TABLE FactSales_Map;
`;

function project(): ProjectFile[] {
  return [{ path: "Sales_ETL.qvs", ext: ".qvs", size: qvs.length, isText: true, content: qvs, note: "" }];
}

describe("QVS-only final table reconstruction", () => {
  it("expands LOAD *, carries QVD/concatenate lineage, applies intermediate joins and emits the exact final schema", () => {
    const analysis = runEnterpriseAnalysis(project());
    const expected = [
      "SalesID", "OrderDate", "CustomerID", "ProductID", "RegionID", "CurrencyCode",
      "Quantity", "UnitPriceUSD", "DiscountPct", "RevenueUSD", "CostUSD", "SalesChannel",
      "OrderStatus", "SalesRep", "SalesRegionName", "CustomerName", "Segment", "Industry",
      "Status", "EmailDomain", "CreditLimitUSD", "RiskBand", "PaymentTerms", "LoyaltyTier",
      "AccountManager", "DigitalAdoptionFlag", "ProfitUSD", "SalesBand",
    ];

    const profile = analysis.profiles.FactSales_Final;
    const plan = analysis.executionPlans?.FactSales_Final;
    const query = analysis.mQueries.FactSales_Final;

    expect(profile.fields).toEqual(expected);
    expect(profile.fields).not.toContain("Object");
    expect(profile.fields).not.toContain("*");
    expect(plan?.finalColumns).toEqual(expected);
    expect(plan?.joins).toHaveLength(2);
    expect(plan?.joins.every((join) => join.leftKeys.includes("CustomerID"))).toBe(true);
    expect(plan?.calculations.map((item) => item.name)).toEqual(expect.arrayContaining([
      "SalesRegionName", "ProfitUSD", "SalesBand",
    ]));

    expect(query).toContain("Table.Combine");
    expect(query).toContain("Table.NestedJoin");
    expect(query).toContain("Calculated_SalesRegionName");
    expect(query).toContain("Calculated_ProfitUSD");
    expect(query).toContain("Calculated_SalesBand");
    expect(query).not.toContain("Calculated_Object");
    expect(query).toContain(`FinalFactSales_FinalColumns = Table.SelectColumns`);
    for (const column of expected) expect(query).toContain(`"${column}"`);
  });
});
