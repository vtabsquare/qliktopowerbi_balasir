import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { extractFilesFromRawList } from "@/components/migration/MultiFileDropzone";
import { runEnterpriseAnalysis, tableRole, type TableProfile } from "@/lib/migration/enterprise-parser";

describe("Universal File Analysis & Multi-Fact Migration Engine", () => {
  it("recursively extracts files from nested ZIP archives", async () => {
    const innerZip = new JSZip();
    innerZip.file("Scripts/Shipments.qvs", "Shipments: LOAD ShipmentID, CustomerID, FreightRevenue FROM [lib://Data/Shipments.csv];");
    innerZip.file("Data/Customers.csv", "CustomerID,CustomerName\nC1,Acme");
    const innerBlob = await innerZip.generateAsync({ type: "arraybuffer" });

    const outerZip = new JSZip();
    outerZip.file("SupplyChainControlTower/nested_bundle.zip", innerBlob);
    outerZip.file("SupplyChainControlTower/Readme.txt", "Supply Chain");
    const outerBuf = await outerZip.generateAsync({ type: "arraybuffer" });

    const outerFile = new File([outerBuf], "Vignesh 2 .zip", { type: "application/zip" });
    if (typeof outerFile.arrayBuffer !== "function") {
      Object.defineProperty(outerFile, "arrayBuffer", {
        value: async () => outerBuf,
      });
    }
    const extracted = await extractFilesFromRawList([outerFile], "__SKIP__");

    const paths = extracted.map((f) => f.path);
    expect(paths).toContain("SupplyChainControlTower/Readme.txt");
    expect(paths).toContain("SupplyChainControlTower/nested_bundle/Scripts/Shipments.qvs");
    expect(paths).toContain("SupplyChainControlTower/nested_bundle/Data/Customers.csv");
  });

  it("identifies multiple fact tables and dimension tables accurately via tableRole", () => {
    const makeProfile = (table: string, fields: string[]): TableProfile => ({
      table,
      fields,
      classification: "resident/file",
      operations: [],
      sourceRefs: [],
      isLoaded: true,
    });

    expect(tableRole(makeProfile("Shipments", ["ShipmentID", "CustomerID", "CarrierID", "WarehouseID", "RouteID", "ShipDate", "FreightRevenue", "FreightCost"]))).toBe("fact");
    expect(tableRole(makeProfile("DeliveryExceptions", ["ExceptionID", "ShipmentID", "ReasonCode", "ResolutionDays"]))).toBe("fact");
    expect(tableRole(makeProfile("ServiceTargets", ["TargetID", "ZoneCode", "TargetMonth", "OnTimeTargetPct"]))).toBe("fact");
    expect(tableRole(makeProfile("FuelIndex", ["FuelIndexID", "MonthKey", "DieselIndexRate"]))).toBe("fact");

    expect(tableRole(makeProfile("Customers", ["CustomerID", "CustomerName", "Segment"]))).toBe("dimension");
    expect(tableRole(makeProfile("Carriers", ["CarrierID", "CarrierName", "Mode"]))).toBe("dimension");
    expect(tableRole(makeProfile("Warehouses", ["WarehouseID", "WarehouseName", "City"]))).toBe("dimension");
    expect(tableRole(makeProfile("Routes", ["RouteID", "Origin", "Destination"]))).toBe("dimension");
    expect(tableRole(makeProfile("MasterCalendar", ["%DateKey", "Date", "Year", "Month"]))).toBe("dimension");
  });

  it("resolves MasterCalendar Peek Min/Max calculated %DateKey to the physical source date column", () => {
    const qvs = `
Shipments:
LOAD
  ShipmentID,
  CustomerID,
  ShipDate,
  Num(Date#(ShipDate, 'YYYY-MM-DD')) as %DateKey,
  FreightRevenue
FROM [../SourceData/Shipments.csv] (txt, utf8, embedded labels, delimiter is ',');

TempMinMax:
LOAD
  Min(%DateKey) as MinDate,
  Max(%DateKey) as MaxDate
RESIDENT Shipments;

LET vMinDate = Num(Peek('MinDate', 0, 'TempMinMax'));
LET vMaxDate = Num(Peek('MaxDate', 0, 'TempMinMax'));
DROP TABLE TempMinMax;

TempCalendar:
LOAD
  Date($(vMinDate) + IterNo() - 1) as TempDate
AUTOGENERATE 1
WHILE $(vMinDate) + IterNo() - 1 <= $(vMaxDate);

MasterCalendar:
LOAD
  TempDate as %DateKey,
  Date(TempDate) as CalendarDate,
  Year(TempDate) as CalendarYear
RESIDENT TempCalendar;
DROP TABLE TempCalendar;
`;
    const result = runEnterpriseAnalysis([
      {
        path: "SupplyChain.qvs",
        ext: ".qvs",
        size: qvs.length,
        isText: true,
        content: qvs,
        note: "",
      },
    ]);

    const calMQuery = result.mQueries["MasterCalendar"] || "";
    expect(calMQuery).toContain("Source_Shipments");
    expect(calMQuery).toContain("ShipDate");
    expect(calMQuery).not.toContain("Source_Shipments[%DateKey]");
    expect(calMQuery).not.toContain('Table.Column(Source_Shipments, "%DateKey")');
  });
});
