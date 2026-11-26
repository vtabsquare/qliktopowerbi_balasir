import fs from "fs";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { extractFilesFromRawList } from "@/components/migration/MultiFileDropzone";
import { runEnterpriseAnalysis, tableRole, type ProjectFile, type TableProfile } from "@/lib/migration/enterprise-parser";
import { buildPowerBiModel } from "@/lib/migration/model/PowerBiModelBuilder";
import { deepValidatePowerQueries } from "@/lib/migration/power-query/MQueryDeepValidator";
import { generatePbipZip } from "@/lib/migration/pbip-generator";

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

  it("buildPowerBiModel detects Shipments, DeliveryExceptions, ServiceTargets, and FuelIndex as fact tables", () => {
    const qvs = `
Customers:
LOAD CustomerID, CustomerName, Segment FROM [../SourceData/Customers.csv] (txt, utf8, embedded labels, delimiter is ',');

Carriers:
LOAD CarrierID, CarrierName, PrimaryMode FROM [../SourceData/Carriers.csv] (txt, utf8, embedded labels, delimiter is ',');

Warehouses:
LOAD WarehouseID, WarehouseName, City FROM [../SourceData/Warehouses.csv] (txt, utf8, embedded labels, delimiter is ',');

Routes:
LOAD RouteID, RouteName, DistanceKm FROM [../SourceData/Routes.csv] (txt, utf8, embedded labels, delimiter is ',');

Shipments:
LOAD ShipmentID, OrderID, ShipDate, CustomerID, CarrierID, WarehouseID, RouteID, WeightKg, FreightRevenue, FreightCost
FROM [../SourceData/Shipments.csv] (txt, utf8, embedded labels, delimiter is ',');

DeliveryExceptions:
LOAD ExceptionID, ShipmentID, ExceptionDate, ExceptionType, ResolutionHours
FROM [../SourceData/DeliveryExceptions.csv] (txt, utf8, embedded labels, delimiter is ',');

ServiceTargets:
LOAD DestinationZone, TargetMonth, OnTimeTargetPct, CostPerKgTarget
FROM [../SourceData/OperationalTargets.xlsx] (ooxml, embedded labels, table is ServiceTargets);

FuelIndex:
LOAD Month, DieselIndex, JetFuelIndex, RailIndex
FROM [../SourceData/OperationalTargets.xlsx] (ooxml, embedded labels, table is FuelIndex);
`;
    const analysis = runEnterpriseAnalysis([
      { path: "SupplyChainControlTower-prj/LoadScript.txt", ext: ".txt", size: qvs.length, isText: true, content: qvs, note: "" },
    ]);
    const model = buildPowerBiModel(analysis, null, null, "SupplyChainControlTower");
    const byName = new Map(model.tables.map((t) => [t.name, t]));

    expect(byName.get("Shipments")?.kind).toBe("fact");
    expect(byName.get("DeliveryExceptions")?.kind).toBe("fact");
    expect(byName.get("ServiceTargets")?.kind).toBe("fact");
    expect(byName.get("FuelIndex")?.kind).toBe("fact");
    expect(byName.get("Customers")?.kind).toBe("dimension");
    expect(byName.get("Carriers")?.kind).toBe("dimension");
    expect(byName.get("Warehouses")?.kind).toBe("dimension");
    expect(byName.get("Routes")?.kind).toBe("dimension");
  });

  it("parses all generated M queries from Vignesh_2_.zip without M Engine Invalid literal errors", async () => {
    const zipPath = "C:/Users/moham/.gemini/antigravity/brain/9043524f-8d86-4047-9934-518cf33477fe/.user_uploaded/media_1795680526526_c86fdf53.zip";
    if (!fs.existsSync(zipPath)) return;
    const buf = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(buf);
    const files: ProjectFile[] = [];
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const ext = "." + (path.split(".").pop() || "").toLowerCase();
      const isText = [".txt", ".qvs", ".csv", ".xml", ".json", ".md"].includes(ext);
      const content = isText ? await entry.async("string") : "";
      files.push({ path, ext, size: content.length, isText, content, note: "" });
    }
    const analysis = runEnterpriseAnalysis(files);
    const deepResult = await deepValidatePowerQueries(analysis.mQueries, analysis.stagingQueries || {}, analysis.columnTypes, analysis.tablePreviews);
    const blockers = Object.values(deepResult.queries).flatMap((q) => q.issues).filter((i) => i.severity === "blocking-error");
    if (blockers.length) {
      console.error("M PARSE BLOCKERS:", JSON.stringify(blockers, null, 2));
      for (const b of blockers) {
        const code = analysis.mQueries[b.queryName] || analysis.stagingQueries?.[b.queryName] || "";
        console.error(`--- ${b.queryName} ---\n${code}`);
      }
    }
    expect(blockers).toEqual([]);

    const model = buildPowerBiModel(analysis, null, null, "SupplyChainControlTower");
    const pbipBlob = await generatePbipZip(analysis, "SupplyChainControlTower", { powerBiModel: model });
    const pbipBuf = await pbipBlob.arrayBuffer();
    const pbipZip = await JSZip.loadAsync(pbipBuf);
    const { DefaultSettings, TaskUtils } = await import("@microsoft/powerquery-parser");
    const tmdlMBlocks: Array<{ file: string; m: string }> = [];
    for (const [p, entry] of Object.entries(pbipZip.files)) {
      if (entry.dir || !p.endsWith(".tmdl")) continue;
      const txt = await entry.async("string");
      const matches = txt.matchAll(/```([\s\S]*?)```/g);
      for (const m of matches) {
        tmdlMBlocks.push({ file: p, m: m[1].replace(/^\r?\n/, "") });
      }
    }
    const pqErrors: Array<{ file: string; error: string; m: string }> = [];
    for (const block of tmdlMBlocks) {
      const res = await TaskUtils.tryLexParse(DefaultSettings, block.m);
      if (!TaskUtils.isOk(res)) {
        pqErrors.push({ file: block.file, error: String((res as any).error?.message || JSON.stringify((res as any).error)), m: block.m.slice(0, 600) });
      }
    }
    if (pqErrors.length) {
      console.error("PQ PARSER ERRORS:", JSON.stringify(pqErrors, null, 2));
    }
    expect(pqErrors).toEqual([]);
    // Ensure no single M string literal exceeds Power BI Desktop's literal length limit
    // and no unescaped #(...) sequence (e.g. Qlik Date#(...) inside M strings) remains.
    for (const block of tmdlMBlocks) {
      const longLiterals = (block.m.match(/"(?:[^"]|""){20001,}"/g) || []);
      expect(longLiterals).toEqual([]);
      const badEscapes = (block.m.match(/"(?:[^"]|"")*#\((?!(?:cr|lf|tab|#|[0-9a-fA-F]{4}|[0-9a-fA-F]{8})\))/g) || []);
      expect(badEscapes).toEqual([]);
    }
  });
});
