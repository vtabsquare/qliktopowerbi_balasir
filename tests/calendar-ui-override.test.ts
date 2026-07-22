import { describe, expect, it } from "vitest";
import { generateUserCalendarM, applyCalendarOverrideToAnalysis } from "../src/lib/migration/calendar-override";
import type { EnterpriseAnalysis, TableProfile } from "../src/lib/migration/enterprise-parser";

const profile = (table: string, fields: string[]): TableProfile => ({
  table, classification: "fact", status: "generated", confidence: 100, reason: "test", fields,
  sourceRefs: [], qvdInputs: [], qvdOutputs: [], dependencies: [], mappingDependencies: [], inlineDependencies: [],
  droppedIntermediates: [], joinLogic: [], concatLogic: [], filters: [], calculatedColumns: [], lineageIds: [],
  lineageScript: "", flowSteps: [], etlStory: "", reviewNotes: [],
});

function analysis(): EnterpriseAnalysis {
  const fact = profile("FactSales_Final", ["SalesID", "Date", "SalesAmount"]);
  return {
    inventory: { totalFiles: 0, textFiles: 0, files: [] }, operations: [], variables: {}, connections: [],
    profiles: { FactSales_Final: fact }, finalTables: [fact], excludedTables: [], sourceMappings: [], sourceCatalog: [],
    columnTypes: { FactSales_Final: { SalesID: "Text", Date: "Date", SalesAmount: "Decimal Number" } }, columnTypeMeta: {},
    daxMeasures: [], mQueries: { FactSales_Final: "let Source = #table({}, {}) in Source" }, mQueryDiagnostics: [],
    relationships: [], semanticModel: { name: "x", tables: [], relationships: [] },
    validation: { isReadyForPbipExport: true, errorCount: 0, warningCount: 0, issues: [], desktopDiagnostics: [] },
    migrationReport: "", logs: [], logicDecisions: [], powerQueryReviews: {}, tablePreviews: {},
  };
}

describe("calendar UI override", () => {
  it("creates a calendar from a selected final table and date column", () => {
    const input = analysis();
    input.calendarOverride = { mode: "final-table", calendarTableName: "Calendar", sourceTable: "FactSales_Final", sourceColumn: "Date", fiscalStartMonth: 4 };
    const result = applyCalendarOverrideToAnalysis(input);
    expect(result.mQueries.Calendar).toContain('RangeSource = #"FactSales_Final"');
    expect(result.mQueries.Calendar).toContain('RangeColumn = "Date"');
    expect(result.mQueries.Calendar).toContain("List.Dates");
    expect(result.mQueries.Calendar).not.toContain("ManualSource");
    expect(result.relationships[0]).toMatchObject({ fromTable: "FactSales_Final", fromColumn: "Date", toTable: "Calendar", toColumn: "Date" });
  });

  it("creates a calendar from explicit dates", () => {
    const m = generateUserCalendarM({ mode: "fixed-range", calendarTableName: "MasterCalendar", startDate: "2024-01-01", endDate: "2026-12-31", fiscalStartMonth: 4 });
    expect(m).toContain("#date(2024, 1, 1)");
    expect(m).toContain("#date(2026, 12, 31)");
    expect(m).toContain("ReviewedTypeConversions");
    expect(m).toContain('"FinancialYear", type text');
  });
});
