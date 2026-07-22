import { describe, expect, it } from "vitest";
import { runEnterpriseAnalysis, type ProjectFile } from "@/lib/migration/enterprise-parser";

describe("AUTOGENERATE calendar compiler regression", () => {
  it("compiles variable-driven IterNo/WHILE calendars without ManualSource and without function names as columns", () => {
    const script = `
LET vMinDate = Num(MakeDate(2024,1,1));
LET vMaxDate = Num(MakeDate(2026,6,30));

TempCalendar:
LOAD
    $(vMinDate) + IterNo() - 1 AS CalendarDate
AUTOGENERATE 1
WHILE $(vMinDate) + IterNo() - 1 <= $(vMaxDate);

MasterCalendar:
LOAD
    Date(CalendarDate) AS Date,
    Year(CalendarDate) AS Year,
    'Q' & Ceil(Month(CalendarDate)/3) AS Quarter,
    Month(CalendarDate) AS Month,
    MonthName(CalendarDate) AS MonthYear,
    Week(CalendarDate) AS Week,
    WeekDay(CalendarDate) AS WeekDay,
    Day(CalendarDate) AS Day,
    If(Month(CalendarDate) >= 4,
        Year(CalendarDate) & '-' & Right(Year(CalendarDate)+1,2),
        Year(CalendarDate)-1 & '-' & Right(Year(CalendarDate),2)
    ) AS FinancialYear
RESIDENT TempCalendar;

DROP TABLE TempCalendar;
`;
    const files: ProjectFile[] = [{ path: "Calendar.qvs", ext: ".qvs", size: script.length, isText: true, content: script, note: "test" }];
    const analysis = runEnterpriseAnalysis(files);
    const m = analysis.mQueries.MasterCalendar || "";
    expect(m).toContain("List.Dates");
    expect(m).not.toContain("QLIK2PBI.ManualSource");
    expect(m).not.toContain('{"CalendarDate", "WeekDay", "Right"}');
    expect(m).toContain("Date.DayOfWeekName");
    expect(m).toContain("Text.End");
  });
});

it("resolves AUTOGENERATE bounds from variables declared in a separate included script and preserves the AS alias", () => {
  const main = `
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
    { path: "00_Main.qvs", ext: ".qvs", size: main.length, isText: true, content: main, note: "variables" },
    { path: "04_Calendar.qvs", ext: ".qvs", size: calendar.length, isText: true, content: calendar, note: "calendar" },
  ];
  const analysis = runEnterpriseAnalysis(files);
  const m = analysis.mQueries.MasterCalendar || "";
  expect(m).toContain("Table.FromColumns");
  expect(m).toContain('{"CalendarDate"}');
  expect(m).toContain("QLIK2PBI.InvalidAutogenerateSchema");
  expect(m).not.toContain("QLIK2PBI.ManualSource");
  expect(m).not.toContain("Manual_TempCalendar");
});
