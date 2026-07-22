import { describe, expect, it } from "vitest";
import { analyzeCalendars } from "@/lib/migration/calendar-analysis";

describe("generic calendar analysis", () => {
  it("detects variable-driven AUTOGENERATE calendars without treating functions as fields", () => {
    const result = analyzeCalendars({
      variables: {
        vMinDate: "Num(MakeDate(2024,1,1))",
        vMaxDate: "Num(MakeDate(2026,6,30))",
      },
      operations: [
        {
          id: "OP1",
          table: "TempCalendar",
          kind: "load",
          raw: "TempCalendar:\nLOAD $(vMinDate) + IterNo() - 1 AS CalendarDate\nAUTOGENERATE 1\nWHILE $(vMinDate) + IterNo() - 1 <= $(vMaxDate);",
          fields: ["CalendarDate"],
          resident: [],
          sourceRefs: [],
        },
        {
          id: "OP2",
          table: "MasterCalendar",
          kind: "load",
          raw: "MasterCalendar:\nLOAD Date(CalendarDate) AS Date, Year(CalendarDate) AS Year, 'Q' & Ceil(Month(CalendarDate)/3) AS Quarter, WeekDay(CalendarDate) AS WeekDay, If(Month(CalendarDate)>=4, Year(CalendarDate)&'-'&Right(Year(CalendarDate)+1,2), Year(CalendarDate)-1&'-'&Right(Year(CalendarDate),2)) AS FinancialYear RESIDENT TempCalendar;",
          fields: ["Date", "Year", "Quarter", "WeekDay", "FinancialYear"],
          resident: ["TempCalendar"],
          sourceRefs: [],
        },
      ],
      mQueries: {},
    } as any);

    expect(result.summary.detected).toBe(2);
    const temp = result.candidates.find((candidate) => candidate.table === "TempCalendar");
    expect(temp?.kind).toBe("autogenerate");
    expect(temp?.startLogic).toBe("2024-01-01");
    expect(temp?.endLogic).toBe("2026-06-30");

    const master = result.candidates.find((candidate) => candidate.table === "MasterCalendar");
    expect(master?.generatedColumns).toContain("Date");
    expect(master?.generatedColumns).not.toContain("WeekDay(");
    expect(master?.warnings.some((warning) => warning.includes("Text.End"))).toBe(true);
  });
});
