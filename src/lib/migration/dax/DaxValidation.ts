import type { PowerBiTable } from "../model/PowerBiModelTypes";

export type DaxValidationStatus = "valid" | "needs-fix" | "validation-failed";
export type DaxValidationSeverity = "error" | "warning";

export interface DaxValidationIssue {
  code: string;
  severity: DaxValidationSeverity;
  message: string;
  reason: string;
  offset?: number;
  line?: number;
  column?: number;
}

export interface DaxMeasureInput {
  id: string;
  name: string;
  expression: string;
  table: string;
}

export interface DaxValidationResult {
  measureId: string;
  measureName: string;
  status: DaxValidationStatus;
  issues: DaxValidationIssue[];
  validatedExpression: string;
}

// DAX has no browser parser. This allow-list deliberately covers the scalar,
// table, time-intelligence, relationship and window functions emitted by this
// application. Unknown calls are blocked instead of being silently exported.
const DAX_FUNCTIONS = new Set(`
ABS ACOS ACOSH ACOT ACOTH ADDCOLUMNS ADDMISSINGITEMS ALL ALLCROSSFILTERED
ALLEXCEPT ALLNOBLANKROW ALLSELECTED AND APPROXIMATEDISTINCTCOUNT ASIN ASINH
ATAN ATANH AVERAGE AVERAGEA AVERAGEX BETA.DIST BETA.INV BITAND BITLSHIFT
BITOR BITRSHIFT BITXOR BLANK CALCULATE CALCULATETABLE CALENDAR CALENDARAUTO
CEILING CHISQ.DIST CHISQ.DIST.RT CHISQ.INV CHISQ.INV.RT CLOSINGBALANCEMONTH
CLOSINGBALANCEQUARTER CLOSINGBALANCEYEAR COALESCE COLUMNSTATISTICS COMBIN
COMBINA CONCATENATE CONCATENATEX CONFIDENCE.NORM CONFIDENCE.T CONTAINS
CONTAINSROW CONTAINSSTRING CONTAINSSTRINGEXACT CONVERT COS COSH COT COTH
COUNT COUNTA COUNTAX COUNTBLANK COUNTROWS COUNTX CROSSFILTER CROSSJOIN
CURRENCY CURRENTGROUP CUSTOMDATA DATATABLE DATE DATEADD DATEDIFF DATESBETWEEN
DATESINPERIOD DATESMTD DATESQTD DATESYTD DATEVALUE DAY DEGREES DETAILROWS
DISTINCT DISTINCTCOUNT DISTINCTCOUNTNOBLANK DIVIDE EARLIER EARLIEST EDATE
ENDOFMONTH ENDOFQUARTER ENDOFYEAR EOMONTH ERROR EVEN EXACT EXCEPT EXP
EXPON.DIST FACT FALSE FILTER FIND FIRSTDATE FIRSTNONBLANK FIRSTNONBLANKVALUE
FIXED FLOOR FORMAT FV GENERATE GENERATEALL GENERATESERIES GEOMEAN GEOMEANX
GROUPBY HASH HOUR IF IF.EAGER IFERROR IGNORE INDEX INT INTERSECT ISAFTER
ISBLANK ISERROR ISEVEN ISFILTERED ISINSCOPE ISLOGICAL ISNONTEXT ISNUMBER
ISO.CEILING ISODD ISONORAFTER ISSELECTEDMEASURE ISSUBTOTAL ISTEXT KEEPFILTERS
LASTDATE LASTNONBLANK LASTNONBLANKVALUE LEFT LEN LN LOG LOG10 LOOKUPVALUE
LOWER MATCH MAX MAXA MAXX MEDIAN MEDIANX MID MIN MINA MINUTE MINX MOD MONTH
MOVINGAVERAGE MROUND NATURALINNERJOIN NATURALLEFTOUTERJOIN NEXTDAY NEXTMONTH
NEXTQUARTER NEXTYEAR NONVISUAL NOT NOW NPER ODD OFFSET OPENINGBALANCEMONTH
OPENINGBALANCEQUARTER OPENINGBALANCEYEAR OR ORDERBY PARALLELPERIOD PARTITIONBY
PATH PATHCONTAINS PATHITEM PATHITEMREVERSE PATHLENGTH PERCENTILE.EXC
PERCENTILE.INC PERCENTILEX.EXC PERCENTILEX.INC PERMUT PI PMT POWER PREVIOUSDAY
PREVIOUSMONTH PREVIOUSQUARTER PREVIOUSYEAR PRODUCT PRODUCTX QUARTER QUOTIENT
RADIANS RAND RANDBETWEEN RANK RANK.EQ RANKX RELATED RELATEDTABLE REMOVEFILTERS
REPLACE REPT RIGHT ROLLUP ROLLUPADDISSUBTOTAL ROLLUPGROUP ROLLUPISSUBTOTAL
ROUND ROUNDDOWN ROUNDUP ROW SAMEPERIODLASTYEAR SAMPLE SEARCH SECOND SELECTCOLUMNS
SELECTEDMEASURE SELECTEDMEASUREFORMATSTRING SELECTEDMEASURENAME SELECTEDVALUE
SIGN SIN SINH SQRT STARTOFMONTH STARTOFQUARTER STARTOFYEAR STDEV.P STDEV.S
STDEVX.P STDEVX.S SUBSTITUTE SUBSTITUTEWITHINDEX SUM SUMMARIZE
SUMMARIZECOLUMNS SUMX SWITCH TAN TANH TIME TIMEVALUE TODAY TOPN TOTALMTD TOTALQTD
TOTALYTD TREATAS TRIM TRUE TRUNC UNION UPPER USERELATIONSHIP UTCNOW UTCTODAY
VALUE VALUES VAR.P VAR.S VARX.P VARX.S WEEKDAY WEEKNUM WINDOW XIRR XNPV YEAR
YEARFRAC
`.trim().split(/\s+/));

function location(expression: string, offset: number) {
  const before = expression.slice(0, offset);
  const lines = before.split("\n");
  return { offset, line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function addIssue(
  issues: DaxValidationIssue[],
  expression: string,
  code: string,
  severity: DaxValidationSeverity,
  message: string,
  reason: string,
  offset?: number,
) {
  if (issues.some((issue) => issue.code === code && issue.message === message)) return;
  issues.push({ code, severity, message, reason, ...(typeof offset === "number" ? location(expression, offset) : {}) });
}

function maskedDax(expression: string): { text: string; lexicalIssues: Array<{ message: string; offset: number }> } {
  const chars = [...expression];
  const lexicalIssues: Array<{ message: string; offset: number }> = [];
  let quote = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < chars.length; index += 1) {
    const ch = chars[index];
    const next = chars[index + 1];
    if (lineComment) {
      if (ch === "\n") lineComment = false;
      else chars[index] = " ";
      continue;
    }
    if (blockComment) {
      chars[index] = " ";
      if (ch === "*" && next === "/") { chars[index + 1] = " "; blockComment = false; index += 1; }
      continue;
    }
    if (quote) {
      chars[index] = " ";
      if (ch === '"' && next === '"') { chars[index + 1] = " "; index += 1; }
      else if (ch === '"') quote = false;
      continue;
    }
    if (ch === "/" && next === "/") { chars[index] = chars[index + 1] = " "; lineComment = true; index += 1; continue; }
    if (ch === "/" && next === "*") { chars[index] = chars[index + 1] = " "; blockComment = true; index += 1; continue; }
    if (ch === '"') { chars[index] = " "; quote = true; }
  }
  if (quote) lexicalIssues.push({ message: "Unterminated DAX text string.", offset: Math.max(0, expression.lastIndexOf('"')) });
  if (blockComment) lexicalIssues.push({ message: "Unterminated DAX block comment.", offset: Math.max(0, expression.lastIndexOf("/*")) });
  return { text: chars.join(""), lexicalIssues };
}

function balancedDelimiters(expression: string, masked: string, issues: DaxValidationIssue[]) {
  const stack: Array<{ ch: string; offset: number }> = [];
  const pairs: Record<string, string> = { ")": "(", "}": "{" };
  for (let index = 0; index < masked.length; index += 1) {
    const ch = masked[index];
    if (ch === "(" || ch === "{") stack.push({ ch, offset: index });
    else if (ch === ")" || ch === "}") {
      const open = stack.pop();
      if (!open || open.ch !== pairs[ch]) addIssue(issues, expression, "DAX_DELIMITER_MISMATCH", "error", `Unexpected '${ch}'.`, "DAX delimiters are not balanced.", index);
    }
  }
  for (const open of stack) addIssue(issues, expression, "DAX_DELIMITER_UNCLOSED", "error", `Unclosed '${open.ch}'.`, "DAX delimiters are not balanced.", open.offset);
}

function tableNameKey(value: string) { return value.trim().toLowerCase(); }
function objectNameKey(value: string) { return value.trim().toLowerCase(); }

export function validateDaxMeasures(measures: DaxMeasureInput[], tables: PowerBiTable[]): DaxValidationResult[] {
  const tableMap = new Map(tables.map((table) => [tableNameKey(table.name), table]));
  const measureMap = new Map(measures.map((measure) => [objectNameKey(measure.name), measure]));
  const graph = new Map<string, Set<string>>();
  const results = measures.map((measure) => {
    const expression = measure.expression || "";
    const issues: DaxValidationIssue[] = [];
    const masked = maskedDax(expression);
    for (const issue of masked.lexicalIssues) addIssue(issues, expression, "DAX_LEXICAL_ERROR", "error", issue.message, "The expression cannot be parsed until the string or comment is closed.", issue.offset);
    if (!expression.trim()) addIssue(issues, expression, "EMPTY_DAX", "error", "The DAX expression is empty.", "A measure must return a scalar DAX expression.", 0);
    balancedDelimiters(expression, masked.text, issues);
    if (/(?:[+\-*/&=<>]|\b(?:AND|OR|IN|RETURN))\s*$/i.test(masked.text.trim())) addIssue(issues, expression, "DAX_INCOMPLETE_EXPRESSION", "error", "The expression ends with an incomplete operator or keyword.", "Complete the right-hand side of the DAX expression.", Math.max(0, expression.trimEnd().length - 1));
    if (/Manual conversion required|FUNCTION_NOT_MAPPED|\bPLACEHOLDER\b|The end of the input/i.test(expression)) addIssue(issues, expression, "INVALID_DAX_MARKER", "error", "The expression contains an unresolved translation marker.", "Replace the marker with reviewed DAX before continuing.");
    if (/\bVALUE\s*\(\s*"[^0-9.+-][^"]*"\s*\)/i.test(expression)) addIssue(issues, expression, "DAX_INVALID_VALUE_LITERAL", "error", "VALUE() contains a non-numeric field-name literal instead of a valid column or numeric expression.", "Replace VALUE(\"...\") with a valid DAX aggregation or FORMAT() conversion.");

    for (const match of masked.text.matchAll(/\b([A-Za-z][A-Za-z0-9_.]*)\s*\(/g)) {
      const name = match[1].toUpperCase();
      if (!DAX_FUNCTIONS.has(name)) addIssue(issues, expression, "DAX_FUNCTION_UNKNOWN", "error", `Unknown or unsupported DAX function '${match[1]}'.`, "Use a supported DAX function or manually review the translation.", match.index);
      if (["SUM", "AVERAGE", "MIN", "MAX", "COUNT"].includes(name)) {
        const openIdx = (match.index ?? 0) + match[0].length - 1;
        let depth = 1;
        let closeIdx = -1;
        for (let idx = openIdx + 1; idx < masked.text.length; idx += 1) {
          if (masked.text[idx] === "(") depth += 1;
          else if (masked.text[idx] === ")" && --depth === 0) { closeIdx = idx; break; }
        }
        if (closeIdx > openIdx) {
          const inner = expression.slice(openIdx + 1, closeIdx).trim();
          const colMatch = inner.match(/^(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_ ]*))\s*\[([^\]]+)\]$/);
          if (inner && !colMatch) {
            addIssue(
              issues,
              expression,
              "DAX_AGGREGATION_REQUIRES_COLUMN",
              "error",
              `The ${name} function only accepts a column reference as an argument; use ${name}X(Table, expression) instead.`,
              `Rewrite ${name}(...) as ${name}X(Table, ...).`,
              match.index,
            );
          } else if (colMatch && ["SUM", "AVERAGE", "MIN", "MAX"].includes(name)) {
            const tName = (colMatch[1] || colMatch[2] || "").replace(/''/g, "'").trim();
            const cName = (colMatch[3] || "").trim();
            const targetTbl = tableMap.get(tableNameKey(tName));
            const targetCol = targetTbl?.columns.find((c) => objectNameKey(c.name) === objectNameKey(cName));
            if (targetCol?.dataType === "boolean") {
              addIssue(
                issues,
                expression,
                "DAX_BOOLEAN_AGGREGATION",
                "error",
                `The function ${name} cannot work with values of type Boolean ('${tName}'[${cName}]).`,
                `Use ${name}X('${tName}', IF('${tName}'[${cName}], 1, 0)) or change the column data type to Whole Number.`,
                match.index,
              );
            }
          }
        }
      }
    }

    const qualifiedSpans: Array<[number, number]> = [];
    for (const match of masked.text.matchAll(/(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_ ]*))\s*\[([^\]]+)\]/g)) {
      const tableName = (match[1] || match[2] || "").replace(/''/g, "'").trim();
      const objectName = (match[3] || "").trim();
      const start = match.index ?? 0;
      qualifiedSpans.push([start, start + match[0].length]);
      const table = tableMap.get(tableNameKey(tableName));
      if (!table) addIssue(issues, expression, "DAX_TABLE_MISSING", "error", `Referenced table '${tableName}' does not exist in the model.`, "Choose a table from the current model schema.", start);
      else if (!table.columns.some((column) => objectNameKey(column.name) === objectNameKey(objectName)) && !table.measures.some((candidate) => objectNameKey(candidate.name) === objectNameKey(objectName))) {
        addIssue(issues, expression, "DAX_DEPENDENCY_MISSING", "error", `Referenced object '${tableName}[${objectName}]' does not exist in the model.`, "Map the source field to an exported column or select an existing measure.", start);
      }
    }

    const dependencies = new Set<string>();
    for (const match of masked.text.matchAll(/\[([^\]]+)\]/g)) {
      const start = match.index ?? 0;
      if (qualifiedSpans.some(([from, to]) => start >= from && start < to)) continue;
      const name = (match[1] || "").trim();
      const dependency = measureMap.get(objectNameKey(name));
      if (!dependency) addIssue(issues, expression, "DAX_MEASURE_MISSING", "error", `Referenced measure '[${name}]' does not exist.`, "Create or rename the dependent measure, or update this reference.", start);
      else dependencies.add(dependency.id);
    }
    graph.set(measure.id, dependencies);
    return { measureId: measure.id, measureName: measure.name, status: "valid" as DaxValidationStatus, issues, validatedExpression: expression };
  });

  const byId = new Map(results.map((result) => [result.measureId, result]));
  const visit = (start: string, current: string, path: Set<string>): boolean => {
    for (const next of graph.get(current) || []) {
      if (next === start) return true;
      if (!path.has(next)) { const nested = new Set(path).add(next); if (visit(start, next, nested)) return true; }
    }
    return false;
  };
  for (const measure of measures) {
    if (visit(measure.id, measure.id, new Set([measure.id]))) {
      const result = byId.get(measure.id)!;
      addIssue(result.issues, measure.expression, "DAX_CIRCULAR_DEPENDENCY", "error", `Measure '${measure.name}' participates in a circular dependency.`, "Break the dependency cycle before continuing.");
    }
  }
  const expressions = new Map<string, DaxValidationResult>();
  for (const result of results) {
    const key = result.validatedExpression.replace(/\s+/g, "").toLowerCase();
    const previous = key ? expressions.get(key) : undefined;
    if (previous) addIssue(result.issues, result.validatedExpression, "DAX_DUPLICATE_EXPRESSION", "warning", `This expression duplicates measure '${previous.measureName}'.`, "This is non-blocking; consolidate only when both measures have the same business meaning.");
    else if (key) expressions.set(key, result);
  }
  for (const result of results) {
    result.status = result.issues.some((issue) => issue.severity === "error")
      ? (result.issues.some((issue) => issue.code === "DAX_LEXICAL_ERROR") ? "validation-failed" : "needs-fix")
      : "valid";
  }
  return results;
}

export function modelDaxInputs(tables: PowerBiTable[]): DaxMeasureInput[] {
  return tables.flatMap((table) => table.measures.map((measure) => ({ id: measure.id, name: measure.name, expression: measure.expression, table: table.name })));
}

