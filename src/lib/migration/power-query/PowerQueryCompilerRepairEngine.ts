import type { EnterpriseAnalysis, TableProfile } from "../enterprise-parser";

export type CompilerSeverity = "blocking-error" | "error" | "warning" | "information";
export type CompilerRepairKind =
  | "source-resolution"
  | "rename-order"
  | "unsupported-expression"
  | "datatype-contract"
  | "dependency"
  | "schema"
  | "syntax"
  | "manual-review";

export interface CompilerDiagnostic {
  id: string;
  queryName: string;
  severity: CompilerSeverity;
  kind: CompilerRepairKind;
  code: string;
  message: string;
  token?: string;
  evidence: string[];
}

export interface CompilerPatch {
  id: string;
  kind: CompilerRepairKind;
  description: string;
  before?: string;
  after?: string;
  safe: boolean;
  metadataUpdates?: Record<string, unknown>;
}

export interface CompilerIteration {
  iteration: number;
  diagnosticsBefore: CompilerDiagnostic[];
  patches: CompilerPatch[];
  diagnosticsAfter: CompilerDiagnostic[];
  code: string;
}

export interface CompilerRepairResult {
  queryName: string;
  originalCode: string;
  correctedCode: string;
  iterations: CompilerIteration[];
  appliedPatches: CompilerPatch[];
  remainingDiagnostics: CompilerDiagnostic[];
  status: "Technically Validated" | "Reconciliation Required" | "Manual Review Required";
  inferredSource?: { queryName: string; dateColumn: string; confidence: number };
  requiredValidations: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namedQueryReferences(code: string): string[] {
  return [...code.matchAll(/#"([^"]+)"/g)].map((m) => m[1]);
}

function isLikelyStepName(name: string): boolean {
  return /^(Source|Navigation|Promoted Headers|Changed Type|Filtered Rows|Removed Columns|Renamed Columns|Added |Expanded |Merged |Sorted |Grouped |SelectedColumns|Final)/i.test(name);
}

function dateFieldScore(field: string): number {
  const f = field.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (f === "orderdate") return 100;
  if (f === "transactiondate" || f === "salesdate") return 95;
  if (f === "date") return 90;
  if (f.endsWith("date")) return 80;
  if (f.includes("timestamp") || f.endsWith("datetime")) return 60;
  return 0;
}

function profileSourceScore(profile: TableProfile): number {
  const cls = String(profile.classification || "").toLowerCase();
  const status = String(profile.status || "").toLowerCase();
  let score = 0;
  if (/final|fact|model/.test(cls)) score += 30;
  if (/final|included|active/.test(status)) score += 10;
  if (/calendar/.test(profile.table.toLowerCase())) score -= 60;
  return score;
}

export function inferCalendarSource(analysis: EnterpriseAnalysis, targetQuery: string): { queryName: string; dateColumn: string; confidence: number } | undefined {
  const candidates: { queryName: string; dateColumn: string; score: number }[] = [];
  for (const [name, profile] of Object.entries(analysis.profiles ?? {})) {
    if (name === targetQuery || !analysis.mQueries?.[name]) continue;
    for (const field of profile.fields ?? []) {
      const fieldScore = dateFieldScore(field);
      if (fieldScore <= 0) continue;
      const score = fieldScore + profileSourceScore(profile);
      candidates.push({ queryName: name, dateColumn: field, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.queryName.localeCompare(b.queryName));
  const best = candidates[0];
  if (!best) return undefined;
  return { queryName: best.queryName, dateColumn: best.dateColumn, confidence: Math.min(99, Math.max(55, best.score)) };
}

function hasManualSourceError(code: string): boolean {
  return /QLIK2PBI\.ManualSource|No executable source or resident dependency was resolved/i.test(code);
}

function unsupportedWeekDay(code: string): boolean {
  return /QLIK2PBI\.UnsupportedExpression[\s\S]*WeekDay\s*\(\s*CalendarDate\s*\)/i.test(code);
}

function calendarDateRenamedTooEarly(code: string): boolean {
  const rename = code.search(/Table\.RenameColumns\([\s\S]*?\{\{"CalendarDate"\s*,\s*"OrderDate"\}\}/i);
  const laterReference = code.search(/Calculated_Year\s*=|Record\.FieldOrDefault\(_\s*,\s*"CalendarDate"/i);
  return rename >= 0 && laterReference > rename;
}

function reviewedTypeSignature(code: string): string {
  return code.match(/QLIK2PBI REVIEWED TYPES SIGNATURE:\s*([^\r\n]+)/i)?.[1] ?? "";
}

function typeContractProblems(code: string): string[] {
  const problems: string[] = [];
  const signature = reviewedTypeSignature(code).toLowerCase();
  if (/"Q"|Text\.From\("Q"\)/i.test(code) && /(?:^|\|)quarter:whole number(?:\||$)/.test(signature)) problems.push("Quarter is generated as text (Q1-Q4) but reviewed as Whole Number.");
  if (/FinancialYear[\s\S]*Text\.From|Text\.From[\s\S]*FinancialYear/i.test(code) && /(?:^|\|)financialyear:whole number(?:\||$)/.test(signature)) problems.push("FinancialYear is generated as text but reviewed as Whole Number.");
  if (/Date\.Day\(/i.test(code) && /(?:^|\|)day:text(?:\||$)/.test(signature)) problems.push("Day is generated as an integer but reviewed as Text.");
  return problems;
}

export function compilePowerQuery(analysis: EnterpriseAnalysis, queryName: string, code: string): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  if (!/\blet\b[\s\S]*\bin\b/i.test(code)) {
    diagnostics.push({ id: `${queryName}:syntax:let-in`, queryName, severity: "blocking-error", kind: "syntax", code: "M_LET_IN_MISSING", message: "The query does not contain a complete let/in expression.", evidence: ["Power Query queries require a let expression followed by an in result."] });
  }
  if (hasManualSourceError(code)) {
    diagnostics.push({ id: `${queryName}:source:manual`, queryName, severity: "blocking-error", kind: "source-resolution", code: "M_MANUAL_SOURCE", message: "The query contains a generated ManualSource error instead of an executable source.", token: "Manual_TempCalendar", evidence: ["QLIK2PBI.ManualSource", "No executable source or resident dependency was resolved."] });
  }
  if (calendarDateRenamedTooEarly(code)) {
    diagnostics.push({ id: `${queryName}:rename:calendar`, queryName, severity: "blocking-error", kind: "rename-order", code: "M_RENAME_BEFORE_USE", message: "CalendarDate is renamed to OrderDate before later calculations that still reference CalendarDate.", token: "CalendarDate", evidence: ["The rename occurs before Year, Month, Week and other calculated steps."] });
  }
  if (unsupportedWeekDay(code)) {
    diagnostics.push({ id: `${queryName}:expr:weekday`, queryName, severity: "blocking-error", kind: "unsupported-expression", code: "M_UNSUPPORTED_WEEKDAY", message: "The Qlik WeekDay(CalendarDate) expression was emitted as an error instead of Power Query M.", token: "WeekDay(CalendarDate)", evidence: ["Qlik WeekDay can be represented by Date.DayOfWeekName in Power Query."] });
  }
  for (const problem of typeContractProblems(code)) {
    diagnostics.push({ id: `${queryName}:type:${diagnostics.length}`, queryName, severity: "error", kind: "datatype-contract", code: "M_REVIEWED_TYPE_CONFLICT", message: problem, evidence: [reviewedTypeSignature(code)] });
  }
  const available = new Set(Object.keys(analysis.mQueries ?? {}));
  for (const ref of namedQueryReferences(code)) {
    if (!available.has(ref) && !isLikelyStepName(ref)) {
      diagnostics.push({ id: `${queryName}:dependency:${ref}`, queryName, severity: "blocking-error", kind: "dependency", code: "M_DEPENDENCY_NOT_FOUND", message: `Unknown named query: ${ref}`, token: ref, evidence: [`Available queries: ${[...available].join(", ") || "none"}`] });
    }
  }
  return diagnostics;
}


function normalizedTypeName(value: string): string {
  return String(value || "Text").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mTypeForReviewedType(value: string): string {
  const type = normalizedTypeName(value);
  if (["date"].includes(type)) return "type date";
  if (["datetime", "datetimezone"].includes(type)) return type === "datetimezone" ? "type datetimezone" : "type datetime";
  if (["time"].includes(type)) return "type time";
  if (["wholenumber", "integer", "int64", "numberwhole"].includes(type)) return "Int64.Type";
  if (["decimalnumber", "decimal", "double", "number", "fixeddecimalnumber", "currency"].includes(type)) return "type number";
  if (["truefalse", "boolean", "logical"].includes(type)) return "type logical";
  return "type text";
}

function reviewedTypeSignatureFromMap(columnTypes: Record<string, string>): string {
  return Object.entries(columnTypes || {})
    .filter(([column]) => Boolean(column))
    .map(([column, type]) => `${column.toLowerCase()}:${type}`)
    .sort()
    .join("|");
}

function reviewedTypePairs(columnTypes: Record<string, string>): string {
  return Object.entries(columnTypes || {})
    .filter(([column]) => Boolean(column))
    .map(([column, type]) => `{"${column.replace(/"/g, '""')}", ${mTypeForReviewedType(type)}}`)
    .join(", ");
}

function safeReviewedConversionPairs(columnTypes: Record<string, string>): string {
  return Object.entries(columnTypes || {})
    .filter(([column]) => Boolean(column))
    .map(([column, type]) => {
      const escaped = column.replace(/"/g, '""');
      const normalized = normalizedTypeName(type);
      if (normalized === "date") return `{"${escaped}", each try (if _ = null then null else Date.From(_)) otherwise try Date.FromText(Text.Trim(Text.From(_)), [Culture="en-US"]) otherwise null, type date}`;
      if (normalized === "datetime") return `{"${escaped}", each try (if _ = null then null else DateTime.From(_)) otherwise try DateTime.FromText(Text.Trim(Text.From(_)), [Culture="en-US"]) otherwise null, type datetime}`;
      if (normalized === "datetimezone") return `{"${escaped}", each try (if _ = null then null else DateTimeZone.From(_)) otherwise null, type datetimezone}`;
      if (["wholenumber", "integer", "int64", "numberwhole"].includes(normalized)) return `{"${escaped}", each try (if _ = null then null else Int64.From(_)) otherwise try Int64.From(Number.FromText(Text.Trim(Text.From(_)), "en-US")) otherwise null, Int64.Type}`;
      if (["decimalnumber", "decimal", "double", "number", "fixeddecimalnumber", "currency"].includes(normalized)) return `{"${escaped}", each try (if _ = null then null else Number.From(_)) otherwise try Number.FromText(Text.Trim(Text.From(_)), "en-US") otherwise null, type number}`;
      if (["truefalse", "boolean", "logical"].includes(normalized)) return `{"${escaped}", each try (if _ = null then null else Logical.From(_)) otherwise null, type logical}`;
      return `{"${escaped}", each try (if _ = null then null else Text.From(_, "en-US")) otherwise null, type text}`;
    })
    .join(", ");
}

function authoritativeReviewedTypeStep(sourceStep: string, columnTypes: Record<string, string>): string {
  const signature = reviewedTypeSignatureFromMap(columnTypes);
  const pairs = reviewedTypePairs(columnTypes);
  const safePairs = safeReviewedConversionPairs(columnTypes);
  if (!signature || !pairs || !safePairs) return `    ReviewedTypeConversions = ${sourceStep}`;
  return `    // QLIK2PBI REVIEWED TYPES BEGIN\n    // QLIK2PBI REVIEWED TYPES SIGNATURE: ${signature}\n    // QLIK2PBI REVIEWED TYPES END\n    ReviewedTypeConversions = Table.TransformColumnTypes(\n        Table.TransformColumns(\n            ${sourceStep},\n            List.Select({${safePairs}}, each Table.HasColumns(${sourceStep}, _{0})),\n            null,\n            MissingField.Error\n        ),\n        List.Select({${pairs}}, each Table.HasColumns(${sourceStep}, _{0})),\n        "en-US"\n    )`;
}

function finalDateColumnName(columnTypes: Record<string, string>, fallback: string): string {
  const names = Object.keys(columnTypes || {});
  const exact = names.find((name) => /^date$/i.test(name));
  if (exact) return exact;
  const dateLike = names.find((name) => /date$/i.test(name));
  return dateLike || fallback;
}

function hasAutogenerateCalendarLineage(analysis: EnterpriseAnalysis, queryName: string): boolean {
  const operations = analysis.operations ?? [];
  const byTable = new Map<string, typeof operations>();
  for (const operation of operations) {
    const key = String(operation.table || "").toLowerCase();
    if (!key) continue;
    const list = byTable.get(key) ?? [];
    list.push(operation);
    byTable.set(key, list);
  }

  const visited = new Set<string>();
  const inspect = (tableName: string): boolean => {
    const key = String(tableName || "").toLowerCase();
    if (!key || visited.has(key)) return false;
    visited.add(key);
    for (const operation of byTable.get(key) ?? []) {
      const raw = String(operation.resolvedRaw || operation.raw || "");
      if (/\bAUTOGENERATE\b/i.test(raw) && /\b(?:IterNo|RecNo|RowNo)\s*\(/i.test(raw)) return true;
      for (const resident of operation.resident ?? []) {
        if (inspect(resident)) return true;
      }
    }
    return false;
  };

  return inspect(queryName);
}

function buildCalendarQuery(source: { queryName: string; dateColumn: string }, columnTypes: Record<string, string> = {}): string {
  const effectiveTypes = Object.keys(columnTypes).length ? columnTypes : { Date: "Date", Year: "Whole Number", Quarter: "Text", Month: "Text", MonthYear: "Text", Week: "Whole Number", WeekDay: "Text", Day: "Whole Number", FinancialYear: "Text" };
  const q = source.queryName.replace(/"/g, '""');
  const c = source.dateColumn.replace(/"/g, '""');
  const outputDate = finalDateColumnName(effectiveTypes, "Date").replace(/"/g, '""');
  const reviewedStep = authoritativeReviewedTypeStep("ValidatedDateKey", effectiveTypes);
  return `let
    SourceTable = #"${q}",
    ValidateSourceColumn =
        if Table.HasColumns(SourceTable, "${c}") then SourceTable
        else error Error.Record("QLIK2PBI.MissingDateColumn", "The inferred calendar source does not contain the required date column.", [SourceQuery="${q}", RequiredColumn="${c}", AvailableColumns=Table.ColumnNames(SourceTable)]),
    ValidDates = List.Buffer(List.RemoveNulls(List.Transform(Table.Column(ValidateSourceColumn, "${c}"), each try Date.From(_) otherwise null))),
    ValidateDateValues =
        if List.Count(ValidDates) > 0 then ValidDates
        else error Error.Record("QLIK2PBI.NoValidDates", "No valid date values were found in the inferred calendar source.", [SourceQuery="${q}", DateColumn="${c}"]),
    MinimumDate = List.Min(ValidateDateValues),
    MaximumDate = List.Max(ValidateDateValues),
    CalendarDateList = List.Dates(MinimumDate, Duration.Days(MaximumDate - MinimumDate) + 1, #duration(1, 0, 0, 0)),
    CalendarBase = Table.FromList(CalendarDateList, Splitter.SplitByNothing(), {"CalendarDate"}, null, ExtraValues.Error),
    TypedDate = Table.TransformColumnTypes(CalendarBase, {{"CalendarDate", type date}}, "en-US"),
    AddedYear = Table.AddColumn(TypedDate, "Year", each Date.Year(Record.Field(_, "CalendarDate")), Int64.Type),
    AddedQuarter = Table.AddColumn(AddedYear, "Quarter", each "Q" & Text.From(Date.QuarterOfYear(Record.Field(_, "CalendarDate"))), type text),
    AddedQuarterNumber = Table.AddColumn(AddedQuarter, "QuarterNumber", each Date.QuarterOfYear(Record.Field(_, "CalendarDate")), Int64.Type),
    AddedMonth = Table.AddColumn(AddedQuarterNumber, "Month", each Date.ToText(Record.Field(_, "CalendarDate"), "MMM", "en-US"), type text),
    AddedMonthNumber = Table.AddColumn(AddedMonth, "MonthNumber", each Date.Month(Record.Field(_, "CalendarDate")), Int64.Type),
    AddedMonthYear = Table.AddColumn(AddedMonthNumber, "MonthYear", each Date.ToText(Record.Field(_, "CalendarDate"), "MMM yyyy", "en-US"), type text),
    AddedMonthYearSort = Table.AddColumn(AddedMonthYear, "MonthYearSort", each Date.Year(Record.Field(_, "CalendarDate")) * 100 + Date.Month(Record.Field(_, "CalendarDate")), Int64.Type),
    AddedWeek = Table.AddColumn(AddedMonthYearSort, "Week", each Date.WeekOfYear(Record.Field(_, "CalendarDate"), Day.Monday), Int64.Type),
    AddedWeekDay = Table.AddColumn(AddedWeek, "WeekDay", each Date.DayOfWeekName(Record.Field(_, "CalendarDate"), "en-US"), type text),
    AddedWeekDayNumber = Table.AddColumn(AddedWeekDay, "WeekDayNumber", each Date.DayOfWeek(Record.Field(_, "CalendarDate"), Day.Monday) + 1, Int64.Type),
    AddedDay = Table.AddColumn(AddedWeekDayNumber, "Day", each Date.Day(Record.Field(_, "CalendarDate")), Int64.Type),
    AddedFinancialYear = Table.AddColumn(AddedDay, "FinancialYear", each let d = Record.Field(_, "CalendarDate"), y = Date.Year(d), m = Date.Month(d), startYear = if m >= 4 then y else y - 1 in Text.From(startYear) & "-" & Text.End(Text.From(startYear + 1), 2), type text),
    AddedFinancialYearSort = Table.AddColumn(AddedFinancialYear, "FinancialYearSort", each let d = Record.Field(_, "CalendarDate") in if Date.Month(d) >= 4 then Date.Year(d) else Date.Year(d) - 1, Int64.Type),
    RenamedCalendarDate = Table.RenameColumns(AddedFinancialYearSort, {{"CalendarDate", "${outputDate}"}}, MissingField.Error),
    SelectedCalendarColumns = Table.SelectColumns(RenamedCalendarDate, List.Intersect({Table.ColumnNames(RenamedCalendarDate), {"${outputDate}", "Year", "Quarter", "QuarterNumber", "Month", "MonthNumber", "MonthYear", "MonthYearSort", "Week", "WeekDay", "WeekDayNumber", "Day", "FinancialYear", "FinancialYearSort"}}), MissingField.Ignore),
    NonBlankDateKey = Table.SelectRows(SelectedCalendarColumns, each Record.FieldOrDefault(_, "${outputDate}", null) <> null),
    ValidatedDateKey = Table.Distinct(NonBlankDateKey, {"${outputDate}"}),
${reviewedStep}
in
    ReviewedTypeConversions`;
}

function repairSimpleWeekDay(code: string): { code: string; patch?: CompilerPatch } {
  const expression = /Calculated_WeekDay\s*=\s*error\s+Error\.Record\([\s\S]*?\),\s*\n\s*Calculated_Day\s*=/i;
  if (!expression.test(code)) return { code };
  const replacement = `Calculated_WeekDay = let
                            _withoutTemp = Table.RemoveColumns(Calculated_Week, {"__QLIK2PBI_WeekDay_VALUE"}, MissingField.Ignore),
                            _withValue = Table.AddColumn(_withoutTemp, "__QLIK2PBI_WeekDay_VALUE", each let _d = try Date.From(Record.FieldOrDefault(_, "CalendarDate", null)) otherwise null in if _d = null then null else Date.DayOfWeekName(_d, "en-US"), type text),
                            _withoutOld = Table.RemoveColumns(_withValue, {"WeekDay"}, MissingField.Ignore)
                        in
                            Table.RenameColumns(_withoutOld, {{"__QLIK2PBI_WeekDay_VALUE", "WeekDay"}}, MissingField.Error),
            Calculated_Day =`;
  return { code: code.replace(expression, replacement), patch: { id: "weekday-expression", kind: "unsupported-expression", description: "Convert Qlik WeekDay(CalendarDate) to Date.DayOfWeekName in Power Query.", before: "UnsupportedExpression: WeekDay(CalendarDate)", after: "Date.DayOfWeekName(_d, \"en-US\")", safe: true } };
}

export class PowerQueryCompilerRepairEngine {
  compile(analysis: EnterpriseAnalysis, queryName: string, code = analysis.mQueries?.[queryName] ?? ""): CompilerDiagnostic[] {
    return compilePowerQuery(analysis, queryName, code);
  }

  repair(analysis: EnterpriseAnalysis, queryName: string, options: { maxIterations?: number; allowSourceInference?: boolean } = {}): CompilerRepairResult {
    const originalCode = analysis.mQueries?.[queryName] ?? "";
    let code = originalCode;
    const iterations: CompilerIteration[] = [];
    const appliedPatches: CompilerPatch[] = [];
    const maxIterations = Math.max(1, Math.min(options.maxIterations ?? 5, 10));
    let inferredSource: CompilerRepairResult["inferredSource"];

    for (let i = 1; i <= maxIterations; i += 1) {
      const before = this.compile(analysis, queryName, code);
      if (!before.length) break;
      const patches: CompilerPatch[] = [];

      if (before.some((d) => d.kind === "source-resolution") && options.allowSourceInference !== false) {
        // Never overwrite a recognised Qlik AUTOGENERATE calendar with a
        // fact-table-inferred replacement. The authoritative compiler owns
        // that lineage and must regenerate it from the original variables,
        // WHILE condition and explicit AS alias.
        const hasAuthoritativeAutogenerate = hasAutogenerateCalendarLineage(analysis, queryName);
        inferredSource = hasAuthoritativeAutogenerate ? undefined : inferCalendarSource(analysis, queryName);
        if (inferredSource && /TempCalendar|MasterCalendar|CalendarDate/i.test(code)) {
          const replacement = buildCalendarQuery(inferredSource, analysis.columnTypes?.[queryName] ?? {});
          patches.push({ id: `calendar-source-${i}`, kind: "source-resolution", description: `Reconstruct the calendar from ${inferredSource.queryName}[${inferredSource.dateColumn}] and generate calendar attributes in a safe dependency order.`, before: code, after: replacement, safe: inferredSource.confidence >= 80, metadataUpdates: { sourceQuery: inferredSource.queryName, sourceDateColumn: inferredSource.dateColumn } });
          code = replacement;
        }
      }

      if (!patches.length && before.some((d) => d.kind === "unsupported-expression")) {
        const result = repairSimpleWeekDay(code);
        code = result.code;
        if (result.patch) patches.push(result.patch);
      }

      if (!patches.length) break;
      appliedPatches.push(...patches);
      const after = this.compile({ ...analysis, mQueries: { ...(analysis.mQueries ?? {}), [queryName]: code } }, queryName, code);
      iterations.push({ iteration: i, diagnosticsBefore: before, patches, diagnosticsAfter: after, code });
      if (!after.length) break;
    }

    const remainingDiagnostics = this.compile({ ...analysis, mQueries: { ...(analysis.mQueries ?? {}), [queryName]: code } }, queryName, code);
    const blocking = remainingDiagnostics.some((d) => d.severity === "blocking-error" || d.severity === "error");
    return {
      queryName,
      originalCode,
      correctedCode: code,
      iterations,
      appliedPatches,
      remainingDiagnostics,
      status: blocking ? "Manual Review Required" : "Reconciliation Required",
      inferredSource,
      requiredValidations: ["M lexical and syntax validation", "Named-query dependency validation", "Schema validation", "Datatype validation", "Preview execution", "Qlik-to-Power BI reconciliation", "PBIP open and refresh"],
    };
  }
}
