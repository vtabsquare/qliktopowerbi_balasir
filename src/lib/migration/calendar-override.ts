import type { EnterpriseAnalysis, Relationship, TableProfile } from "./enterprise-parser";

export type CalendarCreationMode = "qlik" | "final-table" | "fixed-range" | "disabled";

export interface CalendarOverrideConfig {
  mode: CalendarCreationMode;
  calendarTableName: string;
  sourceTable?: string;
  sourceColumn?: string;
  startDate?: string;
  endDate?: string;
  fiscalStartMonth?: number;
  culture?: string;
}

export const DEFAULT_CALENDAR_OVERRIDE: CalendarOverrideConfig = {
  mode: "qlik",
  calendarTableName: "MasterCalendar",
  fiscalStartMonth: 1,
  culture: "en-US",
};

export const CALENDAR_COLUMNS = [
  "Date", "Year", "Quarter", "QuarterNumber", "Month", "MonthNumber",
  "MonthYear", "MonthYearSort", "Week", "WeekDay", "WeekDayNumber", "Day", "FinancialYear",
];

export const CALENDAR_TYPES: Record<string, string> = {
  Date: "Date",
  Year: "Whole Number",
  Quarter: "Text",
  QuarterNumber: "Whole Number",
  Month: "Text",
  MonthNumber: "Whole Number",
  MonthYear: "Text",
  MonthYearSort: "Whole Number",
  Week: "Whole Number",
  WeekDay: "Text",
  WeekDayNumber: "Whole Number",
  Day: "Whole Number",
  FinancialYear: "Text",
};

function esc(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function safeName(value: string): string {
  return (value || "MasterCalendar").trim() || "MasterCalendar";
}

function dateLiteral(value: string | undefined, label: string): string {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return `error Error.Record("QLIK2PBI.InvalidCalendar${label}", "Enter ${label.toLowerCase()} in YYYY-MM-DD format.", [Value=${esc(value || "")}])`;
  }
  return `#date(${Number(match[1])}, ${Number(match[2])}, ${Number(match[3])})`;
}

export function generateUserCalendarM(config: CalendarOverrideConfig): string {
  const culture = config.culture || "en-US";
  const fiscalStart = Math.min(12, Math.max(1, Number(config.fiscalStartMonth || 1)));
  const range = config.mode === "final-table"
    ? `RangeSource = #"${String(config.sourceTable || "").replace(/"/g, '""')}",
    RangeColumn = ${esc(config.sourceColumn || "")},
    ValidatedRangeSource = if Table.HasColumns(RangeSource, {RangeColumn}) then RangeSource else error Error.Record("QLIK2PBI.MissingCalendarRangeColumn", "The selected final table does not contain the selected calendar date column.", [SourceQuery=${esc(config.sourceTable || "")}, RequiredColumn=RangeColumn, AvailableColumns=Table.ColumnNames(RangeSource)]),
    DateValues = List.Buffer(List.RemoveNulls(List.Transform(Table.Column(ValidatedRangeSource, RangeColumn), each try Date.From(_) otherwise try Date.FromText(Text.Trim(Text.From(_)), [Culture=${esc(culture)}]) otherwise null))),
    MinimumDate = if List.Count(DateValues) > 0 then List.Min(DateValues) else error Error.Record("QLIK2PBI.NoValidCalendarMinimum", "The selected final table contains no valid date values.", [SourceQuery=${esc(config.sourceTable || "")}, SourceColumn=RangeColumn]),
    MaximumDate = if List.Count(DateValues) > 0 then List.Max(DateValues) else error Error.Record("QLIK2PBI.NoValidCalendarMaximum", "The selected final table contains no valid date values.", [SourceQuery=${esc(config.sourceTable || "")}, SourceColumn=RangeColumn]),`
    : `MinimumDate = ${dateLiteral(config.startDate, "StartDate")},
    MaximumDate = ${dateLiteral(config.endDate, "EndDate")},`;

  return `let
    // QLIK2PBI USER-CONTROLLED CALENDAR BEGIN
    CalendarMode = ${esc(config.mode)},
    ${range}
    ValidatedMaximumDate = if MaximumDate >= MinimumDate then MaximumDate else error Error.Record("QLIK2PBI.InvalidCalendarRange", "Calendar end date must be on or after the start date.", [MinimumDate=MinimumDate, MaximumDate=MaximumDate]),
    CalendarDateList = List.Dates(MinimumDate, Duration.Days(ValidatedMaximumDate - MinimumDate) + 1, #duration(1, 0, 0, 0)),
    CalendarBase = Table.FromColumns({CalendarDateList}, {"Date"}),
    TypedDate = Table.TransformColumnTypes(CalendarBase, {{"Date", type date}}, ${esc(culture)}),
    AddedAttributes = Table.AddColumn(TypedDate, "__CalendarAttributes", each
        let
            d = [Date],
            y = Date.Year(d),
            m = Date.Month(d),
            fiscalStartYear = if m >= ${fiscalStart} then y else y - 1,
            fiscalEndYear = fiscalStartYear + 1
        in [
            Year = y,
            Quarter = "Q" & Text.From(Date.QuarterOfYear(d)),
            QuarterNumber = Date.QuarterOfYear(d),
            Month = Date.ToText(d, "MMM", ${esc(culture)}),
            MonthNumber = m,
            MonthYear = Date.ToText(d, "MMM yyyy", ${esc(culture)}),
            MonthYearSort = y * 100 + m,
            Week = Date.WeekOfYear(d, Day.Monday),
            WeekDay = Date.DayOfWeekName(d, ${esc(culture)}),
            WeekDayNumber = Date.DayOfWeek(d, Day.Monday) + 1,
            Day = Date.Day(d),
            FinancialYear = if ${fiscalStart} = 1 then Text.From(y) else Text.From(fiscalStartYear) & "-" & Text.End(Text.From(fiscalEndYear), 2)
        ], type record),
    ExpandedAttributes = Table.ExpandRecordColumn(AddedAttributes, "__CalendarAttributes", {${CALENDAR_COLUMNS.slice(1).map(esc).join(", ")}}, {${CALENDAR_COLUMNS.slice(1).map(esc).join(", ")}}),
    ValidatedDateKey = Table.Distinct(Table.SelectRows(ExpandedAttributes, each [Date] <> null), {"Date"}),
    // QLIK2PBI REVIEWED TYPES BEGIN
    // QLIK2PBI REVIEWED TYPES SIGNATURE: date:Date|day:Whole Number|financialyear:Text|month:Text|monthnumber:Whole Number|monthyear:Text|monthyearsort:Whole Number|quarter:Text|quarternumber:Whole Number|week:Whole Number|weekday:Text|weekdaynumber:Whole Number|year:Whole Number
    // QLIK2PBI REVIEWED TYPES END
    ReviewedTypeConversions = Table.TransformColumnTypes(ValidatedDateKey, {{"Date", type date}, {"Year", Int64.Type}, {"Quarter", type text}, {"QuarterNumber", Int64.Type}, {"Month", type text}, {"MonthNumber", Int64.Type}, {"MonthYear", type text}, {"MonthYearSort", Int64.Type}, {"Week", Int64.Type}, {"WeekDay", type text}, {"WeekDayNumber", Int64.Type}, {"Day", Int64.Type}, {"FinancialYear", type text}}, ${esc(culture)})
in
    ReviewedTypeConversions`;
}

export function applyCalendarOverrideToAnalysis(analysis: EnterpriseAnalysis): EnterpriseAnalysis {
  const config = analysis.calendarOverride;
  if (!config || config.mode === "qlik") return analysis;

  const calendarName = safeName(config.calendarTableName);
  const mQueries = { ...(analysis.mQueries || {}) };
  const profiles = { ...(analysis.profiles || {}) };
  const columnTypes = { ...(analysis.columnTypes || {}) };
  const relationships = [...(analysis.relationships || [])];

  if (config.mode === "disabled") {
    delete mQueries[calendarName];
    delete profiles[calendarName];
    delete columnTypes[calendarName];
    return {
      ...analysis,
      mQueries,
      profiles,
      columnTypes,
      finalTables: analysis.finalTables.filter((table) => table.table !== calendarName),
      relationships: relationships.filter((rel) => rel.fromTable !== calendarName && rel.toTable !== calendarName),
    };
  }

  const existing = profiles[calendarName];
  const profile: TableProfile = existing ? { ...existing } : {
    table: calendarName,
    status: "generated",
    classification: "calendar/date dimension",
    reason: "User-controlled calendar created in the Power Query editor.",
    confidence: 100,
    fields: [],
    sourceRefs: [],
    qvdInputs: [],
    qvdOutputs: [],
    dependencies: [],
    mappingDependencies: [],
    inlineDependencies: [],
    droppedIntermediates: [],
    joinLogic: [],
    concatLogic: [],
    filters: [],
    calculatedColumns: [],
    lineageIds: [],
    lineageScript: "",
    flowSteps: [],
    etlStory: "User-controlled calendar generated in Power Query.",
    reviewNotes: [],
  };
  profile.status = "generated";
  profile.classification = "calendar/date dimension";
  profile.reason = config.mode === "final-table"
    ? `User-controlled calendar sourced from ${config.sourceTable}.${config.sourceColumn}.`
    : `User-controlled calendar from ${config.startDate} through ${config.endDate}.`;
  profile.confidence = 100;
  profile.fields = [...CALENDAR_COLUMNS];
  profiles[calendarName] = profile;
  columnTypes[calendarName] = { ...CALENDAR_TYPES };
  mQueries[calendarName] = generateUserCalendarM(config);

  let nextRelationships = relationships.filter((rel) => rel.fromTable !== calendarName && rel.toTable !== calendarName);
  if (config.mode === "final-table" && config.sourceTable && config.sourceColumn) {
    const relationship: Relationship = {
      fromTable: config.sourceTable,
      fromColumn: config.sourceColumn,
      toTable: calendarName,
      toColumn: "Date",
      score: 300,
      active: true,
      status: "active",
      reason: "User-selected calendar relationship.",
      cardinality: "manyToOne",
      filterDirection: "single",
      confidence: 100,
    };
    nextRelationships = [...nextRelationships, relationship];
  }

  const finalTables = [...analysis.finalTables.filter((table) => table.table !== calendarName), profile];
  return { ...analysis, mQueries, profiles, columnTypes, finalTables, relationships: nextRelationships };
}
