import { describe, expect, it } from "vitest";
import { runEnterpriseAnalysis, type ProjectFile } from "@/lib/migration/enterprise-parser";
import { PowerQueryCompilerRepairEngine } from "@/lib/migration/power-query/PowerQueryCompilerRepairEngine";

describe("calendar AI repair governance", () => {
  it("does not overwrite an AUTOGENERATE calendar with a fact-table inferred calendar", () => {
    const script = `
LET vMinDate = Num(MakeDate(2024,1,1));
LET vMaxDate = Num(MakeDate(2026,6,30));
TempCalendar:
LOAD $(vMinDate) + IterNo() - 1 AS CalendarDate
AUTOGENERATE 1
WHILE $(vMinDate) + IterNo() - 1 <= $(vMaxDate);
MasterCalendar:
LOAD Date(CalendarDate) AS Date, Year(CalendarDate) AS Year
RESIDENT TempCalendar;
`;
    const files: ProjectFile[] = [{ path: "Calendar.qvs", ext: ".qvs", size: script.length, isText: true, content: script, note: "calendar" }];
    const analysis = runEnterpriseAnalysis(files);
    const broken = `let Manual_TempCalendar = error Error.Record("QLIK2PBI.ManualSource", "No executable source or resident dependency was resolved."), Result = Manual_TempCalendar in Result`;
    const result = new PowerQueryCompilerRepairEngine().repair(analysis, "MasterCalendar", broken, { allowSourceInference: true });
    expect(result.correctedCode).toContain("Table.FromColumns");
    expect(result.correctedCode).toContain('{"CalendarDate"}');
    expect(result.correctedCode).not.toContain('SourceTable = #"FactSales_Final"');
    expect(result.correctedCode).not.toContain("QLIK2PBI.ManualSource");
    expect(result.appliedPatches.some((patch) => patch.id.startsWith("calendar-source-"))).toBe(false);
  });
});
