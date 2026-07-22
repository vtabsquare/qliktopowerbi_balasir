import type { EnterpriseAnalysis, Operation } from "./enterprise-parser";

export type CalendarKind =
  | "autogenerate"
  | "resident-distinct"
  | "physical-source"
  | "inline"
  | "canonical"
  | "role-playing"
  | "as-of"
  | "fiscal"
  | "retail"
  | "iso-week"
  | "business-day"
  | "unknown";

export interface CalendarVariableResolution {
  name: string;
  expression: string;
  resolvedValue?: string;
  status: "resolved" | "dependency" | "unresolved";
  confidence: number;
}

export interface CalendarCandidate {
  id: string;
  table: string;
  kind: CalendarKind;
  confidence: number;
  signals: string[];
  sourceOperations: Operation[];
  dateRangeSource: string;
  startLogic: string;
  endLogic: string;
  factDependencies: string[];
  generatedColumns: string[];
  fiscalStartMonth?: number;
  firstDayOfWeek: "Monday" | "Sunday" | "Qlik default";
  culture: string;
  continuous: boolean;
  warnings: string[];
  qlikScript: string;
  generatedM?: string;
  validation: { name: string; status: "pass" | "warning" | "error"; detail: string }[];
}

export interface CalendarAnalysisResult {
  candidates: CalendarCandidate[];
  variables: CalendarVariableResolution[];
  summary: {
    detected: number;
    autogenerate: number;
    fiscal: number;
    rolePlaying: number;
    blocking: number;
  };
}

const CALENDAR_FIELD_RE = /^(date|calendardate|datekey|year|quarter|month|monthname|monthyear|week|weekyear|weekday|day|dayofyear|financialyear|fiscalyear|fiscalmonth|fiscalquarter|asofdate|referencedate)$/i;
const DATE_FUNCTION_RE = /\b(Date|Date#|Year|Month|MonthName|QuarterName|Week|WeekName|WeekDay|Day|DayNumberOfYear|MonthStart|MonthEnd|QuarterStart|QuarterEnd|YearStart|YearEnd|AddMonths|AddYears|MakeDate|MakeWeekDate)\s*\(/i;

function uniq(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }
function literalDate(expr: string): string | undefined {
  const m = expr.match(/MakeDate\s*\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)/i);
  return m ? `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}` : undefined;
}
function variableNameFromExpression(expr: string): string[] {
  return [...expr.matchAll(/\$\(([^)=]+)\)/g)].map(m => m[1].trim());
}
function inferFiscalStart(raw: string): number | undefined {
  const direct = raw.match(/Month\s*\([^)]*\)\s*>=\s*(\d{1,2})/i);
  if (direct) return Math.max(1, Math.min(12, Number(direct[1])));
  const offset = raw.match(/AddMonths\s*\([^,]+,\s*-(\d{1,2})\s*\)/i);
  if (offset) return (Number(offset[1]) % 12) + 1;
  const yearName = raw.match(/YearName\s*\([^,]+,\s*[^,]+,\s*(\d{1,2})\s*\)/i);
  return yearName ? Math.max(1, Math.min(12, Number(yearName[1]))) : undefined;
}
function classifyCalendar(raw: string, table: string): CalendarKind {
  if (/\bAUTOGENERATE\b|\bIterNo\s*\(/i.test(raw)) return "autogenerate";
  if (/\bAsOfDate\b|\bReferenceDate\b|\bMonthDiff\b|\bRolling12/i.test(raw)) return "as-of";
  if (/\b4\s*[-/]\s*4\s*[-/]\s*5\b|\b4\s*[-/]\s*5\s*[-/]\s*4\b|\b5\s*[-/]\s*4\s*[-/]\s*4\b|RetailPeriod|Is53Week/i.test(raw)) return "retail";
  if (/ISOWeek|ISOYear|MakeWeekDate/i.test(raw)) return "iso-week";
  if (/IsWorkingDay|IsHoliday|HolidayName|NetworkDays/i.test(raw)) return "business-day";
  if (/CanonicalDate|DateType/i.test(raw)) return "canonical";
  if (/Fiscal|FinancialYear|YearName\s*\(/i.test(raw)) return "fiscal";
  if (/\bRESIDENT\b/i.test(raw) && /\bDISTINCT\b/i.test(raw)) return "resident-distinct";
  if (/\bINLINE\b/i.test(raw)) return "inline";
  if (/\bFROM\b|\bSQL\s+SELECT\b/i.test(raw)) return "physical-source";
  if (/orderdate|shipdate|invoicedate|duedate|paymentdate/i.test(table + raw)) return "role-playing";
  return "unknown";
}
function bounds(raw: string, variables: Record<string,string>) {
  const varRefs = variableNameFromExpression(raw);
  const minVar = varRefs.find(v => /min|start/i.test(v));
  const maxVar = varRefs.find(v => /max|end/i.test(v));
  const minExpr = minVar ? variables[minVar] : undefined;
  const maxExpr = maxVar ? variables[maxVar] : undefined;
  const minLiteral = minExpr ? literalDate(minExpr) : undefined;
  const maxLiteral = maxExpr ? literalDate(maxExpr) : undefined;
  const residentMinMax = raw.match(/\b(Min|Max)\s*\(\s*([^)]*date[^)]*)\)/ig) ?? [];
  return {
    start: minLiteral || minExpr || (residentMinMax.find(x => /^Min/i.test(x)) ?? "Derived from upstream date values"),
    end: maxLiteral || maxExpr || (residentMinMax.find(x => /^Max/i.test(x)) ?? "Derived from upstream date values"),
    source: minVar || maxVar ? `Variables: ${[minVar,maxVar].filter(Boolean).join(", ")}` : /\bRESIDENT\s+([^;\s]+)/i.exec(raw)?.[1] || (/\bFROM\s+\[([^\]]+)/i.exec(raw)?.[1] ?? "Calendar generation expression"),
  };
}

function validationFor(candidate: Omit<CalendarCandidate,"validation">): CalendarCandidate["validation"] {
  const fields = new Set(candidate.generatedColumns.map(x => x.toLowerCase()));
  const checks: CalendarCandidate["validation"] = [];
  checks.push({ name: "Date key", status: fields.has("date") || fields.has("calendardate") || fields.has("datekey") ? "pass" : "error", detail: "A date key must be present and typed as Date." });
  checks.push({ name: "Executable source", status: candidate.kind === "unknown" ? "warning" : "pass", detail: candidate.kind === "autogenerate" ? "AUTOGENERATE is treated as an executable source and must compile to List.Dates/List.Generate." : `Detected ${candidate.kind} calendar source pattern.` });
  checks.push({ name: "Display sorting", status: fields.has("month") && !fields.has("monthnumber") ? "warning" : "pass", detail: "Dual/display fields should have dedicated numeric sort columns." });
  checks.push({ name: "Datatype contract", status: /quarter|financialyear/i.test(candidate.qlikScript) ? "warning" : "pass", detail: "Text labels such as Q1 or 2025-26 must remain Text; Day and sort fields must be Whole Number." });
  checks.push({ name: "Continuity", status: candidate.continuous ? "pass" : "warning", detail: candidate.continuous ? "Continuous range expected; validate row count against MinDate/MaxDate." : "Sparse calendar detected or continuity not proven." });
  return checks;
}

export function analyzeCalendars(analysis: EnterpriseAnalysis | null): CalendarAnalysisResult {
  if (!analysis) return { candidates: [], variables: [], summary: { detected:0, autogenerate:0, fiscal:0, rolePlaying:0, blocking:0 } };
  const grouped = new Map<string, Operation[]>();
  for (const op of analysis.operations ?? []) {
    const raw = op.raw || op.resolvedRaw || "";
    const table = op.table || "";
    const fieldSignals = (op.fields ?? []).filter(f => CALENDAR_FIELD_RE.test(f)).length;
    const isCandidate = /calendar|date(dim|master|bridge)?/i.test(table) || fieldSignals >= 3 || DATE_FUNCTION_RE.test(raw) || /AUTOGENERATE|CanonicalDate|AsOfDate/i.test(raw);
    if (!isCandidate || !table) continue;
    grouped.set(table, [...(grouped.get(table) ?? []), op]);
  }
  const variables = Object.entries(analysis.variables ?? {}).map(([name, expression]) => {
    const resolvedValue = literalDate(expression);
    const dependency = /Peek|Min\s*\(|Max\s*\(|FieldValue|\$\(/i.test(expression);
    return { name, expression, resolvedValue, status: resolvedValue ? "resolved" : dependency ? "dependency" : "unresolved", confidence: resolvedValue ? 1 : dependency ? .75 : .4 } as CalendarVariableResolution;
  }).filter(v => /date|year|month|week|min|max|fiscal|calendar/i.test(`${v.name} ${v.expression}`));

  const candidates = [...grouped.entries()].map(([table, ops], index) => {
    const raw = ops.map(o => o.raw || o.resolvedRaw).join("\n\n");
    const generatedColumns = uniq(ops.flatMap(o => o.fields ?? []));
    const kind = classifyCalendar(raw, table);
    const b = bounds(raw, analysis.variables ?? {});
    const dependencies = uniq(ops.flatMap(o => [...(o.resident ?? []), ...(o.sourceRefs ?? [])]));
    const signals = uniq([
      /calendar|date/i.test(table) ? "table-name" : "",
      /AUTOGENERATE/i.test(raw) ? "autogenerate" : "",
      /IterNo\s*\(/i.test(raw) ? "date-range-loop" : "",
      generatedColumns.filter(f => CALENDAR_FIELD_RE.test(f)).length >= 3 ? "calendar-fields" : "",
      /Fiscal|FinancialYear/i.test(raw) ? "fiscal-fields" : "",
      /CanonicalDate|DateType/i.test(raw) ? "canonical-date" : "",
      /AsOfDate|ReferenceDate/i.test(raw) ? "as-of-bridge" : "",
    ]);
    const warnings: string[] = [];
    if (kind === "unknown") warnings.push("Calendar intent detected, but the generation pattern is not fully resolved.");
    if (/WeekDay\s*\(/i.test(raw)) warnings.push("Generate WeekDay text plus WeekDayNumber sort column.");
    if (/Right\s*\(/i.test(raw)) warnings.push("Compile Right() to Text.End; do not treat it as a source field.");
    if (/Quarter/i.test(raw) && /['\"]Q['\"]\s*&/i.test(raw)) warnings.push("Quarter label is Text and requires QuarterNumber for sorting.");
    if (/FinancialYear/i.test(raw)) warnings.push("Financial/Fiscal year label must preserve its original text format and inferred start month.");
    const base = {
      id: `CAL-${index+1}`,
      table,
      kind,
      confidence: Math.min(.99, .55 + signals.length * .08),
      signals,
      sourceOperations: ops,
      dateRangeSource: b.source,
      startLogic: b.start,
      endLogic: b.end,
      factDependencies: dependencies,
      generatedColumns,
      fiscalStartMonth: inferFiscalStart(raw),
      firstDayOfWeek: /Day\.Sunday|FirstWeekDay\s*=\s*6/i.test(raw) ? "Sunday" as const : /Day\.Monday|FirstWeekDay\s*=\s*0/i.test(raw) ? "Monday" as const : "Qlik default" as const,
      culture: "Project/default culture",
      continuous: /AUTOGENERATE|List\.Dates|IterNo\s*\(|WHILE/i.test(raw),
      warnings,
      qlikScript: raw,
      generatedM: analysis.mQueries?.[table],
    };
    return { ...base, validation: validationFor(base) } as CalendarCandidate;
  });
  const blocking = candidates.reduce((n,c) => n + c.validation.filter(v => v.status === "error").length, 0);
  return { candidates, variables, summary: { detected:candidates.length, autogenerate:candidates.filter(c=>c.kind==="autogenerate").length, fiscal:candidates.filter(c=>c.kind==="fiscal"||c.fiscalStartMonth).length, rolePlaying:candidates.filter(c=>c.kind==="role-playing"||c.kind==="canonical").length, blocking } };
}
