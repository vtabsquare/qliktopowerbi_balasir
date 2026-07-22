import { describe, expect, it } from "vitest";
import { PowerQueryCompilerRepairEngine } from "../src/lib/migration/power-query/PowerQueryCompilerRepairEngine";

function makeAnalysis(calendarCode: string) {
  return {
    mQueries: {
      FactSales_Final: "let\n Source = #table({\"OrderDate\"}, {{#date(2026,1,1)}})\nin\n Source",
      MasterCalendar: calendarCode,
    },
    profiles: {
      FactSales_Final: {
        table: "FactSales_Final", classification: "final fact", status: "included", confidence: 100, reason: "",
        fields: ["OrderDate", "Amount"], sourceRefs: [], qvdInputs: [], qvdOutputs: [], dependencies: [], mappingDependencies: [], inlineDependencies: [], droppedIntermediates: [], joinLogic: [], concatLogic: [], filters: [], calculatedColumns: [], lineageIds: [], lineageScript: "", flowSteps: [], etlStory: "", reviewNotes: [],
      },
      MasterCalendar: {
        table: "MasterCalendar", classification: "final dimension", status: "included", confidence: 100, reason: "",
        fields: ["OrderDate", "Year"], sourceRefs: [], qvdInputs: [], qvdOutputs: [], dependencies: [], mappingDependencies: [], inlineDependencies: [], droppedIntermediates: [], joinLogic: [], concatLogic: [], filters: [], calculatedColumns: [], lineageIds: [], lineageScript: "", flowSteps: [], etlStory: "", reviewNotes: [],
      },
    },
    mQueryDiagnostics: [],
    validation: { issues: [], errorCount: 0, warningCount: 0, isReadyForPbipExport: false },
  } as any;
}

const brokenCalendar = `let
 Manual_TempCalendar = error Error.Record("QLIK2PBI.ManualSource", "No executable source or resident dependency was resolved.", [Table="TempCalendar"]),
 SelectedColumns = Table.SelectColumns(Manual_TempCalendar, {"CalendarDate", "WeekDay"}, MissingField.Error),
 RenamedColumns = Table.RenameColumns(SelectedColumns, {{"CalendarDate", "OrderDate"}}, MissingField.Error),
 Calculated_Year = Table.AddColumn(RenamedColumns, "Year", each Date.Year(Date.From(Record.FieldOrDefault(_, "CalendarDate", null)))),
 Calculated_WeekDay = error Error.Record("QLIK2PBI.UnsupportedExpression", "unsupported", [Expression="WeekDay(CalendarDate)"])
in
 Calculated_WeekDay
// QLIK2PBI REVIEWED TYPES SIGNATURE: day:Text|financialyear:Whole Number|quarter:Whole Number`;

describe("Power Query compiler repair engine", () => {
  it("detects the calendar root causes deterministically", () => {
    const analysis = makeAnalysis(brokenCalendar);
    const engine = new PowerQueryCompilerRepairEngine();
    const diagnostics = engine.compile(analysis, "MasterCalendar");
    expect(diagnostics.map((d) => d.code)).toContain("M_MANUAL_SOURCE");
    expect(diagnostics.map((d) => d.code)).toContain("M_RENAME_BEFORE_USE");
    expect(diagnostics.map((d) => d.code)).toContain("M_UNSUPPORTED_WEEKDAY");
  });

  it("reconstructs a generic calendar from the best grounded date source", () => {
    const analysis = makeAnalysis(brokenCalendar);
    const engine = new PowerQueryCompilerRepairEngine();
    const result = engine.repair(analysis, "MasterCalendar");
    expect(result.inferredSource).toMatchObject({ queryName: "FactSales_Final", dateColumn: "OrderDate" });
    expect(result.correctedCode).toContain('SourceTable = #"FactSales_Final"');
    expect(result.correctedCode).toContain("Date.DayOfWeekName");
    expect(result.correctedCode).toContain('{"Quarter", type text}');
    expect(result.correctedCode).toContain('{"FinancialYear", type text}');
    expect(result.correctedCode.indexOf("AddedFinancialYear")).toBeLessThan(result.correctedCode.indexOf("RenamedCalendarDate"));
    expect(result.remainingDiagnostics).toHaveLength(0);
    expect(result.status).toBe("Reconciliation Required");
  });

  it("does not invent a source when no date-bearing query exists", () => {
    const analysis = makeAnalysis(brokenCalendar);
    analysis.profiles.FactSales_Final.fields = ["Amount"];
    const result = new PowerQueryCompilerRepairEngine().repair(analysis, "MasterCalendar");
    expect(result.inferredSource).toBeUndefined();
    expect(result.status).toBe("Manual Review Required");
    expect(result.remainingDiagnostics.some((d) => d.code === "M_MANUAL_SOURCE")).toBe(true);
  });
});
