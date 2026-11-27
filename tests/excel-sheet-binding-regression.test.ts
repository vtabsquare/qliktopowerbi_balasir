import { describe, expect, it } from "vitest";
import {
  parseProject,
  runEnterpriseAnalysis,
  type ProjectFile,
} from "@/lib/migration/enterprise-parser";
import { compileQlikMExpression } from "@/lib/migration/power-query/QlikMExpressionCompiler";
import { deepValidatePowerQueries } from "@/lib/migration/power-query/MQueryDeepValidator";

function script(content: string): ProjectFile {
  return { path: "LoadScript.qvs", ext: ".qvs", size: content.length, isText: true, content, note: "" };
}

function sheet(workbook: string, name: string, csv: string): ProjectFile {
  return {
    path: `${workbook}#sheet=${encodeURIComponent(name)}`,
    sourcePath: workbook,
    sheetName: name,
    ext: ".csv",
    size: csv.length,
    isText: true,
    content: csv,
    note: `Worksheet ${name}`,
  };
}

const qlik = `
Patients:
LOAD PatientID, PatientName
FROM [SourceData/Patient_Data.xlsx]
(ooxml, embedded labels, table is Patients);

Encounters:
LOAD DISTINCT
    EncounterID,
    PatientID as %PatientKey,
    Date(Floor(AdmissionDate)) as AdmissionDate
FROM [SourceData/Patient_Data.xlsx]
(ooxml, embedded labels, table is Encounters);
`;

describe("Excel worksheet binding and Qlik hidden keys", () => {
  it("retains the requested table-is worksheet on parsed operations", () => {
    const parsed = parseProject([script(qlik)]);
    expect(parsed.operations.find((operation) => operation.table === "Patients")?.sourceSheetName).toBe("Patients");
    expect(parsed.operations.find((operation) => operation.table === "Encounters")?.sourceSheetName).toBe("Encounters");
    expect(parsed.operations.find((operation) => operation.table === "Encounters")?.fields).not.toContain("DISTINCT_EncounterID");
  });

  it("embeds each requested worksheet instead of reusing the first worksheet", () => {
    const analysis = runEnterpriseAnalysis([
      script(qlik),
      sheet("SourceData/Patient_Data.xlsx", "Patients", "PatientID,PatientName\nP1,Asha\n"),
      sheet("SourceData/Patient_Data.xlsx", "Encounters", "EncounterID,PatientID,AdmissionDate\nE1,P1,2025-01-15\n"),
    ]);

    expect(analysis.stagingQueries?.Source_Patients).toContain("UGF0aWVudElELFBhdGllbnROYW1l");
    expect(analysis.stagingQueries?.Source_Encounters).toContain("RW5jb3VudGVySUQsUGF0aWVudElELEFkbWlzc2lvbkRhdGU");
    expect(analysis.stagingQueries?.Source_Encounters).toContain("QLIK2PBI EXCEL SHEET: Encounters");
    expect(analysis.tablePreviews.Encounters.sourceRows[0]).toMatchObject({ EncounterID: "E1", PatientID: "P1" });
    expect(analysis.columnTypes.Encounters.AdmissionDate).toBe("Date");
  });

  it("compiles percent-prefixed Qlik keys and date-floor expressions", () => {
    const key = compileQlikMExpression("%PatientKey");
    expect(key.code).toBe('Record.FieldOrDefault(_, "PatientKey", null)');
    expect(key.warnings).toEqual([]);

    const date = compileQlikMExpression("Date(Floor(AdmissionDate))");
    expect(date.code).toContain("Date.FromText");
    expect(date.code).not.toBeNull();
  });

  it("blocks fatal generated placeholders even when the M grammar is valid", async () => {
    const result = await deepValidatePowerQueries({
      Broken: `let\n    Source = #table({"A"}, {{1}}),\n    Calculated_A = error Error.Record("QLIK2PBI.UnsupportedExpression", "unsupported", [Expression="%A"])\nin\n    Calculated_A`,
    });
    expect(result.passed).toBe(false);
    expect(result.queries.Broken.issues.some((issue) => issue.code === "GENERATED_UNSUPPORTED_EXPRESSION")).toBe(true);
  });
});
