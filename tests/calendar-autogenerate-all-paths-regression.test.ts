import { describe, expect, it } from "vitest";
import { applyDataTypeOverrides, runEnterpriseAnalysis, type ProjectFile } from "@/lib/migration/enterprise-parser";

describe("AUTOGENERATE authoritative generation paths", () => {
  it("preserves the executable calendar through initial generation and datatype regeneration", () => {
    const variables = `
LET vMinDate = Num(MakeDate(2024,1,1));
LET vMaxDate = Num(MakeDate(2026,6,30));
`;
    const calendar = `
TempCalendar:
LOAD $(vMinDate) + IterNo() - 1 AS CalendarDate
AUTOGENERATE 1
WHILE $(vMinDate) + IterNo() - 1 <= $(vMaxDate);

MasterCalendar:
LOAD Date(CalendarDate) AS Date, Year(CalendarDate) AS Year
RESIDENT TempCalendar;
`;
    const files: ProjectFile[] = [
      { path: "00_Variables.qvs", ext: ".qvs", size: variables.length, isText: true, content: variables, note: "variables" },
      { path: "04_Calendar.qvs", ext: ".qvs", size: calendar.length, isText: true, content: calendar, note: "calendar" },
    ];

    const initial = runEnterpriseAnalysis(files);
    expect(initial.mQueries.MasterCalendar).toContain("List.Dates");
    expect(initial.mQueries.MasterCalendar).toContain('Table.FromColumns({CalendarDateList}, {"CalendarDate"})');
    expect(initial.mQueries.MasterCalendar).not.toContain("QLIK2PBI.ManualSource");

    const regenerated = applyDataTypeOverrides(initial, { "MasterCalendar.Date": "Date" });
    expect(regenerated.mQueries.MasterCalendar).toContain("List.Dates");
    expect(regenerated.mQueries.MasterCalendar).not.toContain("QLIK2PBI.ManualSource");
  });
});
