import type {
  BinaryNode,
  ExpressionAstNode,
  ExpressionIssue,
  FunctionNode,
  SetAnalysisNode,
} from "../expression";
import { ExpressionParser, walkExpression } from "../expression";
import { daxColumn } from "./DaxNameResolver";
import type { DaxTranslationContext, DaxTranslationResult } from "./DaxTypes";
import { qlikNamedColour, qlikRgbToDax } from "./DaxSafety";

interface RenderResult {
  text: string;
  confidence: number;
  issues: ExpressionIssue[];
  explanation: string[];
  unsupported: boolean;
  missingDependency: boolean;
}

const empty = (text = ""): RenderResult => ({ text, confidence: 100, issues: [], explanation: [], unsupported: false, missingDependency: false });
const combine = (...parts: RenderResult[]): Omit<RenderResult, "text"> => ({
  confidence: Math.min(100, ...parts.map((p) => p.confidence)),
  issues: parts.flatMap((p) => p.issues),
  explanation: parts.flatMap((p) => p.explanation),
  unsupported: parts.some((p) => p.unsupported),
  missingDependency: parts.some((p) => p.missingDependency),
});

function literal(value: unknown): string {
  if (value === null) return "BLANK()";
  if (typeof value === "boolean") return value ? "TRUE()" : "FALSE()";
  if (typeof value === "number") return String(value);
  return `"${String(value).replace(/"/g, '""')}"`;
}

function normalizedField(name: string): string { return name.toLowerCase().replace(/[^a-z0-9]/g, ""); }

export class DaxTranslator {
  translate(source: string, context: DaxTranslationContext): DaxTranslationResult {
    const parsed = new ExpressionParser().parse(source);
    if (!parsed.ast) {
      return {
        dax: `// Manual conversion required\n// ${source}`,
        artifactType: "manual-redesign",
        confidence: 0,
        status: "unsupported",
        referencedTables: [], referencedColumns: [], referencedMeasures: [],
        issues: parsed.diagnostics,
        explanation: ["The Qlik expression could not be parsed into a deterministic syntax tree."],
      };
    }
    // Compound semantic rules run before generic function-by-function rendering.
    // This prevents patterns such as RangeSum(Above(Sum(...))) from degrading
    // into invalid iterator DAX such as SUMX(SUM(...), ...).
    const semantic = this.renderSemanticPattern(parsed.ast, context);
    const rendered = semantic ?? this.render(parsed.ast, context);
    const fields = new Set<string>();
    const tables = new Set<string>();
    const measures = new Set<string>();
    walkExpression(parsed.ast, (node) => {
      if (node.kind === "field") {
        fields.add(node.name);
        const table = node.table || this.resolveTable(node.name, context);
        if (table) tables.add(table);
      }
      if (node.kind === "variable" && context.variables[node.name]?.isCalculated) measures.add(node.name);
    });
    const issues = [...parsed.diagnostics, ...rendered.issues];
    const status = rendered.missingDependency ? "missing-dependency" : rendered.unsupported ? "manual" : issues.some((i) => i.severity === "warning" || i.severity === "error") ? "warning" : "automatic";
    return {
      dax: rendered.text || `// Manual conversion required\n// ${source}`,
      artifactType: this.classify(parsed.ast, source),
      confidence: Math.max(0, Math.min(100, rendered.confidence - parsed.diagnostics.length * 5)),
      status,
      referencedTables: [...tables], referencedColumns: [...fields], referencedMeasures: [...measures],
      issues,
      explanation: rendered.explanation.length ? rendered.explanation : ["Translated from the normalized Qlik expression AST."],
      ast: parsed.ast,
    };
  }


  private renderSemanticPattern(node: ExpressionAstNode, context: DaxTranslationContext): RenderResult | null {
    if (node.kind !== "function" || node.name.toLowerCase().replace(/\s+/g, "") !== "rangesum") return null;
    if (node.args.length !== 1) return null;
    const above = node.args[0];
    if (above.kind !== "function" || above.name.toLowerCase().replace(/\s+/g, "") !== "above") return null;
    if (above.args.length < 1 || above.args.length > 3) return null;

    const aggregate = above.args[0];
    if (aggregate.kind !== "function") return null;
    const aggregateName = aggregate.name.toLowerCase().replace(/\s+/g, "");
    const daxAggregate = ({ sum: "SUM", count: "COUNT", avg: "AVERAGE", average: "AVERAGE", min: "MIN", max: "MAX" } as Record<string, string>)[aggregateName];
    if (!daxAggregate || aggregate.args.length !== 1) return null;

    const offsetNode = above.args[1];
    const windowNode = above.args[2];
    const offset = !offsetNode ? 0 : offsetNode.kind === "literal" && typeof offsetNode.value === "number" ? offsetNode.value : null;
    if (offset !== 0) {
      return {
        text: `// Manual conversion required: rolling-window offset ${offset === null ? "is dynamic" : offset} is not yet proven equivalent`,
        confidence: 25, unsupported: true, missingDependency: false,
        issues: [{ severity: "error", code: "ROLLING_WINDOW_OFFSET_REVIEW", message: "RangeSum(Above()) was detected, but only offset 0 has a deterministic date-window conversion.", recommendation: "Map the visual ordering and choose a WINDOW/OFFSET strategy for non-zero offsets." }],
        explanation: ["Detected the compound RangeSum + Above rolling-window pattern before generic function translation."],
      };
    }

    let windowExpression = "1";
    let windowValue: number | null = 1;
    let variableName = "";
    if (windowNode?.kind === "literal" && typeof windowNode.value === "number") {
      windowValue = windowNode.value; windowExpression = String(windowNode.value);
    } else if (windowNode?.kind === "variable") {
      variableName = windowNode.name;
      const variable = context.variables[windowNode.name];
      const raw = String(variable?.evaluatedValue ?? variable?.definition ?? "").trim().replace(/^=/, "");
      if (/^-?\d+(?:\.\d+)?$/.test(raw)) { windowValue = Number(raw); windowExpression = raw; }
      else {
        return {
          text: `// Manual conversion required: unresolved rolling-window variable ${windowNode.name}`,
          confidence: 0, unsupported: false, missingDependency: true,
          issues: [{ severity: "error", code: "ROLLING_WINDOW_VARIABLE_UNRESOLVED", message: `Variable ${windowNode.name} must resolve to a positive numeric window size.`, recommendation: "Provide the SET/LET definition or map it to a Power BI parameter." }],
          explanation: ["Detected RangeSum + Above, but the window-size variable could not be resolved."],
        };
      }
    } else if (windowNode) {
      return {
        text: "// Manual conversion required: dynamic rolling-window expression", confidence: 20, unsupported: true, missingDependency: false,
        issues: [{ severity: "error", code: "ROLLING_WINDOW_DYNAMIC_SIZE", message: "The rolling window size is not a numeric literal or resolvable variable.", recommendation: "Create a validated What-if parameter or manually define the window." }],
        explanation: ["Detected RangeSum + Above, but the window size is dynamic."],
      };
    }
    if (windowValue === null || windowValue <= 0) return null;

    const value = this.render(aggregate.args[0], context);
    const visual = context.visualContext || {};
    const dimensionText = [visual.orderedDimension, ...(visual.dimensions || [])].filter(Boolean).join(" ").toLowerCase();
    const inferredGranularity = visual.granularity && visual.granularity !== "unknown"
      ? visual.granularity
      : /month|yearmonth|monthyear/.test(dimensionText) ? "month"
      : /quarter/.test(dimensionText) ? "quarter"
      : /week/.test(dimensionText) ? "week"
      : /date|day/.test(dimensionText) ? "day"
      : "unknown";
    const dateTable = visual.dateTable || Object.entries(context.fieldToTable).find(([field]) => /^(date|calendar|month|year|orderdate|salesdate)$/.test(field))?.[1];
    const dateColumn = visual.dateColumn || (dateTable ? "Date" : "");

    if (!dateTable || !dateColumn || !["day", "week", "month", "quarter", "year", "fiscal-period"].includes(inferredGranularity)) {
      return {
        text: "// Manual conversion required: RangeSum(Above()) needs an ordered date dimension or a validated Power BI WINDOW strategy",
        confidence: 45, unsupported: true, missingDependency: false,
        issues: [{ severity: "error", code: "ROLLING_WINDOW_VISUAL_CONTEXT_MISSING", message: "A rolling-window pattern was detected, but the ordered date dimension, granularity, or target Date column could not be proven.", recommendation: "Map the Qlik chart dimension and sort order to a Power BI Date table, or select a WINDOW strategy for categorical ordering." }],
        explanation: ["The converter refused to assume that Above() means calendar months without date-grain metadata."],
      };
    }

    const interval = inferredGranularity === "fiscal-period" ? "MONTH" : inferredGranularity.toUpperCase();
    const dateRef = daxColumn(dateTable, dateColumn);
    const sortDirection = visual.sortDirection || "unknown";
    const issues: ExpressionIssue[] = [];
    if (sortDirection === "descending" || sortDirection === "unknown") {
      issues.push({ severity: "information", code: "ROLLING_WINDOW_SORT_ASSUMPTION", message: `The source sort direction is ${sortDirection}; generated date intelligence assumes chronological period semantics.`, recommendation: "Confirm that the business requirement is a backward-looking calendar window." });
    }
    const baseExpression = `${daxAggregate}(${value.text})`;
    const varLine = variableName ? `VAR RollingPeriods = ${windowExpression} // resolved from ${variableName}` : `VAR RollingPeriods = ${windowExpression}`;
    const dax = `${varLine}\nVAR CurrentDate = MAX(${dateRef})\nRETURN\n    CALCULATE(\n        ${baseExpression},\n        DATESINPERIOD(\n            ${dateRef},\n            CurrentDate,\n            -RollingPeriods,\n            ${interval}\n        )\n    )`;
    const verified = visual.semanticValidationPassed === true;
    return {
      text: dax,
      confidence: verified ? 100 : 89,
      unsupported: false, missingDependency: false,
      issues: [...value.issues, ...issues],
      explanation: [
        "Detected semantic pattern: rolling aggregate using RangeSum + Above.",
        `Resolved window size to ${windowExpression}${variableName ? ` from ${variableName}` : ""}.`,
        `Generated DATESINPERIOD over ${dateTable}[${dateColumn}] at ${inferredGranularity} grain.`,
        verified ? "Semantic comparison was marked as passed by the calling validation pipeline." : "The DAX is deterministic, but confidence is capped below 100 until runtime semantic comparison passes.",
      ],
    };
  }

  private resolveTable(field: string, context: DaxTranslationContext): string {
    return context.fieldToTable[normalizedField(field)] || context.fieldToTable[field] || context.homeTable;
  }

  private render(node: ExpressionAstNode, context: DaxTranslationContext): RenderResult {
    switch (node.kind) {
      case "literal": return empty(literal(node.value));
      case "field": {
        const table = node.table || this.resolveTable(node.name, context);
        return empty(daxColumn(table, node.name));
      }
      case "identifier": return empty(node.name);
      case "raw": return { ...empty(node.value), confidence: 30, unsupported: true, issues: [{ severity: "warning", code: "RAW_EXPRESSION_FRAGMENT", message: `Unparsed fragment '${node.value}' was retained.`, recommendation: "Review this fragment manually." }] };
      case "variable": return this.renderVariable(node.name, context);
      case "set-analysis": return this.renderSet(node, context);
      case "unary": {
        const operand = this.render(node.operand, context);
        const op = node.operator === "NOT" ? "NOT " : node.operator;
        return { text: `${op}(${operand.text})`, ...combine(operand) };
      }
      case "binary": return this.renderBinary(node, context);
      case "function": return this.renderFunction(node, context);
    }
  }

  private renderVariable(name: string, context: DaxTranslationContext): RenderResult {
    const variable = context.variables[name];
    if (!variable) {
      return {
        text: `[${name}]`, confidence: 35, unsupported: false, missingDependency: true,
        issues: [{ severity: "error", code: "VARIABLE_DEFINITION_MISSING", message: `Variable ${name} is referenced but its definition was not supplied.`, construct: name, recommendation: "Upload DocInternals.xml/AllProperties.xml or map the variable to a Power BI parameter or measure." }],
        explanation: [`${name} was retained as a measure reference pending user mapping.`],
      };
    }
    return {
      ...empty(`[${name}]`),
      confidence: variable.isCalculated ? 88 : 96,
      explanation: [`Qlik variable ${name} was mapped to one reusable Power BI measure so every dependent measure references the same definition.`],
    };
  }

  private renderBinary(node: BinaryNode, context: DaxTranslationContext): RenderResult {
    const left = this.render(node.left, context);
    const right = this.render(node.right, context);
    const map: Record<string, string> = { "=": "=", "==": "=", "<>": "<>", "!=": "<>", "AND": "&&", "OR": "||", "XOR": "<>" };
    return { text: `(${left.text} ${map[node.operator] ?? node.operator} ${right.text})`, ...combine(left, right) };
  }

  private renderFunction(node: FunctionNode, context: DaxTranslationContext): RenderResult {
    const name = node.name.toLowerCase().replace(/\s+/g, "");
    const args = node.args.map((arg) => this.render(arg, context));
    const merged = combine(...args);
    const arg = (index: number, fallback = "BLANK()") => args[index]?.text || fallback;
    const aggregateMap: Record<string, string> = { sum: "SUM", avg: "AVERAGE", average: "AVERAGE", min: "MIN", max: "MAX", median: "MEDIAN", stdev: "STDEV.S", variance: "VAR.S" };
    let text = "";
    let confidence = merged.confidence;
    let unsupported = merged.unsupported;
    const issues = [...merged.issues];
    const explanation = [...merged.explanation];

    const namedColour = qlikNamedColour(name);
    if (name === "rgb") {
      text = qlikRgbToDax(args.map((item) => item.text), false);
      explanation.push("Qlik RGB() was converted to a Power BI-compatible hexadecimal colour text value.");
    }
    else if (name === "argb") {
      text = qlikRgbToDax(args.map((item) => item.text), true);
      confidence = Math.min(confidence, 90);
      issues.push({ severity: "warning", code: "ARGB_ALPHA_IGNORED", message: "Power BI conditional formatting uses RGB hex text; the Qlik ARGB alpha channel was omitted.", recommendation: "Validate transparency requirements in the target visual." });
      explanation.push("Qlik ARGB() was converted to a Power BI-compatible hexadecimal colour text value.");
    }
    else if (namedColour) {
      text = literal(namedColour);
      explanation.push(`Qlik ${node.name}() was converted to hexadecimal colour ${namedColour}.`);
    }
    else if (aggregateMap[name]) text = `${aggregateMap[name]}(${arg(0)})`;
    else if (name === "count") text = node.distinct ? `DISTINCTCOUNT(${arg(0)})` : `COUNT(${arg(0)})`;
    else if (name === "only") { text = `SELECTEDVALUE(${arg(0)})`; confidence = Math.min(confidence, 90); explanation.push("Qlik Only() was mapped to SELECTEDVALUE()."); }
    else if (name === "if") text = `IF(${arg(0)}, ${arg(1)}, ${arg(2)})`;
    else if (name === "alt") text = `COALESCE(${args.map((a) => a.text).join(", ")})`;
    else if (name === "isnull") text = `ISBLANK(${arg(0)})`;
    else if (name === "len") text = `LEN(${arg(0)})`;
    else if (name === "upper") text = `UPPER(${arg(0)})`;
    else if (name === "lower") text = `LOWER(${arg(0)})`;
    else if (name === "trim") text = `TRIM(${arg(0)})`;
    else if (name === "ltrim") text = `TRIM(${arg(0)})`;
    else if (name === "rtrim") text = `TRIM(${arg(0)})`;
    else if (name === "left") text = `LEFT(${arg(0)}, ${arg(1)})`;
    else if (name === "right") text = `RIGHT(${arg(0)}, ${arg(1)})`;
    else if (name === "mid") text = `MID(${arg(0)}, ${arg(1)}, ${arg(2)})`;
    else if (name === "replace") text = `SUBSTITUTE(${arg(0)}, ${arg(1)}, ${arg(2)})`;
    else if (name === "index") text = `SEARCH(${arg(1)}, ${arg(0)}, 1, 0)`;
    else if (name === "subfield") {
      text = `PATHITEM(SUBSTITUTE(${arg(0)}, ${arg(1)}, "|"), ${arg(2, "1")}, TEXT)`;
      confidence = Math.min(confidence, 70);
      issues.push({ severity: "warning", code: "SUBFIELD_DELIMITER_REVIEW", message: "SubField() was mapped with PATHITEM and assumes the source delimiter can safely be replaced by '|'.", recommendation: "Validate delimiter escaping and the requested element index." });
    }
    else if (name === "chr") text = `UNICHAR(${arg(0)})`;
    else if (name === "ord") text = `UNICODE(${arg(0)})`;
    else if (name === "date") {
      text = args.length > 1 ? `FORMAT(${arg(0)}, ${arg(1)})` : arg(0);
      confidence = Math.min(confidence, args.length > 1 ? 85 : 95);
      if (args.length > 1) explanation.push("Qlik Date() formatting was mapped to DAX FORMAT(); this returns text rather than a dual date value.");
    }
    else if (name === "date#") {
      text = `DATEVALUE(${arg(0)})`;
      confidence = Math.min(confidence, 75);
      issues.push({ severity: "warning", code: "DATE_PARSE_CULTURE_REVIEW", message: "Date#() was mapped to DATEVALUE(), whose result depends on model culture and source format.", recommendation: "Prefer Power Query type conversion with an explicit locale when the format is known." });
    }
    else if (name === "timestamp") {
      text = args.length > 1 ? `FORMAT(${arg(0)}, ${arg(1)})` : arg(0);
      confidence = Math.min(confidence, args.length > 1 ? 80 : 95);
    }
    else if (name === "timestamp#") {
      text = `VALUE(${arg(0)})`;
      confidence = Math.min(confidence, 70);
      issues.push({ severity: "warning", code: "TIMESTAMP_PARSE_CULTURE_REVIEW", message: "Timestamp#() was mapped to VALUE(); validate culture and timezone behaviour.", recommendation: "Use Power Query DateTime.FromText with an explicit locale for deterministic parsing." });
    }
    else if (name === "year") text = `YEAR(${arg(0)})`;
    else if (name === "month") text = `FORMAT(${arg(0)}, "MMM")`;
    else if (name === "monthname") text = `FORMAT(${arg(0)}, "MMM yyyy")`;
    else if (name === "week") text = `WEEKNUM(${arg(0)}, 2)`;
    else if (name === "weekname") text = `FORMAT(${arg(0)}, "yyyy") & "-W" & FORMAT(WEEKNUM(${arg(0)}, 2), "00")`;
    else if (name === "quartername") text = `"Q" & ROUNDUP(MONTH(${arg(0)}) / 3, 0) & " " & YEAR(${arg(0)})`;
    else if (name === "weekday") text = `FORMAT(${arg(0)}, "ddd")`;
    else if (name === "day") text = `DAY(${arg(0)})`;
    else if (name === "today") text = "TODAY()";
    else if (name === "now") text = "NOW()";
    else if (name === "addmonths") text = `EDATE(${arg(0)}, ${arg(1)})`;
    else if (name === "monthstart") text = `DATE(YEAR(${arg(0)}), MONTH(${arg(0)}), 1)`;
    else if (name === "monthend") text = `EOMONTH(${arg(0)}, 0)`;
    else if (name === "yearstart") text = `DATE(YEAR(${arg(0)}), 1, 1)`;
    else if (name === "yearend") text = `DATE(YEAR(${arg(0)}), 12, 31)`;
    else if (name === "age") text = `DATEDIFF(${arg(0)}, ${arg(1, "TODAY()")}, YEAR)`;
    else if (name === "inmonth") text = `(YEAR(${arg(0)}) = YEAR(EDATE(${arg(1)}, ${arg(2, "0")})) && MONTH(${arg(0)}) = MONTH(EDATE(${arg(1)}, ${arg(2, "0")})))`;
    else if (name === "inyear") text = `(YEAR(${arg(0)}) = YEAR(EDATE(${arg(1)}, 12 * ${arg(2, "0")})))`;
    else if (name === "interval") {
      text = args.length > 1 ? `FORMAT(${arg(0)}, ${arg(1)})` : `FORMAT(${arg(0)}, "hh:mm:ss")`;
      confidence = Math.min(confidence, 65);
      issues.push({ severity: "warning", code: "INTERVAL_FORMAT_REVIEW", message: "Interval() formatting was mapped to FORMAT(); durations longer than 24 hours may need explicit arithmetic.", recommendation: "Validate duration semantics and use a dedicated duration measure when required." });
    }
    else if (name === "round") text = `ROUND(${arg(0)}, ${arg(1, "0")})`;
    else if (name === "ceil") text = `CEILING(${arg(0)}, ${arg(1, "1")})`;
    else if (name === "floor") text = `FLOOR(${arg(0)}, ${arg(1, "1")})`;
    else if (name === "fabs" || name === "abs") text = `ABS(${arg(0)})`;
    else if (name === "sqrt") text = `SQRT(${arg(0)})`;
    else if (name === "exp") text = `EXP(${arg(0)})`;
    else if (name === "log") text = `LN(${arg(0)})`;
    else if (name === "mod") text = `MOD(${arg(0)}, ${arg(1)})`;
    else if (name === "div") text = `QUOTIENT(${arg(0)}, ${arg(1)})`;
    else if (name === "sign") text = `SIGN(${arg(0)})`;
    else if (name === "null") text = "BLANK()";
    else if (name === "rangesum") {
      text = `// Manual conversion required for RangeSum()\n${arg(0)}`;
      confidence = Math.min(confidence, 30); unsupported = true;
      issues.push({ severity: "error", code: "RANGESUM_SEMANTIC_PATTERN_REQUIRED", message: "RangeSum() cannot be converted by scalar function substitution.", recommendation: "Use a registered compound semantic rule such as RangeSum + Above, or review manually." });
    }
    else if (name === "rangeavg") text = `DIVIDE(SUMX({ ${args.map((a) => a.text).join(", ")} }, [Value]), ${Math.max(1, args.length)})`;
    else if (name === "fractile") {
      text = `PERCENTILEX.INC(ALL('${context.homeTable}'), ${arg(0)}, ${arg(1, "0.5")})`;
      confidence = Math.min(confidence, 75);
      issues.push({ severity: "warning", code: "FRACTILE_GRAIN_REVIEW", message: "Fractile() was mapped to PERCENTILEX.INC over the inferred home table.", recommendation: "Confirm the intended filter context and percentile method." });
    }
    else if (name === "getselectedcount") text = `COUNTROWS(VALUES(${arg(0)}))`;
    else if (name === "getfieldselections") {
      text = `CONCATENATEX(VALUES(${arg(0)}), ${arg(0)}, ", ")`;
      confidence = Math.min(confidence, 80);
    }
    else if (name === "noofrows") text = `COUNTROWS('${context.homeTable}')`;
    else if (name === "match" || name === "mixmatch") {
      text = `SWITCH(${arg(0)}, ${args.slice(1).map((a, i) => `${a.text}, ${i + 1}`).join(", ")}, 0)`;
      confidence = Math.min(confidence, 80);
    }
    else if (name === "wildmatch") {
      text = `SWITCH(TRUE(), ${args.slice(1).map((a, i) => `CONTAINSSTRING(${arg(0)}, SUBSTITUTE(${a.text}, "*", "")), ${i + 1}`).join(", ")}, 0)`;
      confidence = Math.min(confidence, 55);
      issues.push({ severity: "warning", code: "WILDMATCH_REVIEW", message: "WildMatch wildcard semantics are only approximated by CONTAINSSTRING.", recommendation: "Review wildcard and case-sensitivity behaviour." });
    }
    else if (name === "pick") text = `SWITCH(${arg(0)}, ${args.slice(1).map((a, i) => `${i + 1}, ${a.text}`).join(", ")}, BLANK())`;
    else if (name === "rank") {
      text = `RANKX(ALL('${context.homeTable}'), ${arg(0)}, , DESC, Dense)`;
      confidence = Math.min(confidence, 55);
      issues.push({ severity: "warning", code: "RANK_CONTEXT_REVIEW", message: "Rank() was mapped to RANKX over the inferred home table.", recommendation: "Confirm ranking scope, sort direction, ties and partitioning dimensions." });
    }
    else if (name === "lookup" && args.length >= 4) {
      text = `LOOKUPVALUE(${arg(0)}, ${arg(1)}, ${arg(2)}${args.length >= 5 ? `, ${arg(3)}, ${arg(4)}` : ""})`;
      confidence = Math.min(confidence, 65);
      issues.push({ severity: "warning", code: "LOOKUP_ARGUMENT_REVIEW", message: "Lookup() was mapped to LOOKUPVALUE; source table and search-column semantics require validation.", recommendation: "Confirm argument order and uniqueness of lookup keys." });
    }
    else if (name === "aggr") {
      const dimensions = args.slice(1).map((a) => a.text);
      text = dimensions.length ? `SUMX(SUMMARIZE(${context.homeTable ? `'${context.homeTable}'` : ""}, ${dimensions.join(", ")}), ${arg(0)})` : arg(0);
      confidence = Math.min(confidence, 55);
      issues.push({ severity: "warning", code: "AGGR_GRAIN_REVIEW", message: "Aggr() was converted to a SUMX/SUMMARIZE pattern and requires grain validation.", recommendation: "Confirm grouping dimensions and outer aggregation semantics." });
    }
    else if (["above", "below", "before", "after", "rowno", "columnno", "dimensionality", "secondarydimensionality", "firstsortedvalue", "peek", "previous", "exists", "applymap", "purgechar", "keepchar"].includes(name)) {
      text = `// Manual conversion required for ${node.name}()\n${arg(0)}`;
      confidence = 20; unsupported = true;
      issues.push({ severity: "error", code: "UNSUPPORTED_CONTEXT_FUNCTION", message: `${node.name}() depends on Qlik chart/load evaluation context.`, construct: node.name, recommendation: "Use DAX window functions, visual calculations, Power Query, or redesign after validating the intended grain." });
    }
    else {
      text = `${node.name.toUpperCase()}(${args.map((a) => a.text).join(", ")})`;
      confidence = Math.min(confidence, 35); unsupported = true;
      issues.push({ severity: "warning", code: "FUNCTION_NOT_MAPPED", message: `${node.name}() has no deterministic translation rule.`, construct: node.name, recommendation: "Review and replace this function manually." });
    }

    if (node.total) {
      text = `CALCULATE(${text}, REMOVEFILTERS())`;
      confidence = Math.min(confidence, 70);
      issues.push({ severity: "warning", code: "TOTAL_SCOPE_REVIEW", message: "TOTAL was mapped to REMOVEFILTERS(); dimensional exceptions may require ALLEXCEPT().", recommendation: "Confirm the intended dimensional scope." });
    }
    if (node.setAnalysis) {
      const filters = this.setFilters(node.setAnalysis, context);
      const all = combine(...filters.parts);
      text = `CALCULATE(${text}${filters.filters.length ? `,\n    ${filters.filters.join(",\n    ")}` : ""})`;
      confidence = Math.min(confidence, all.confidence, 85);
      issues.push(...all.issues);
      explanation.push(`Set Analysis identifier ${node.setAnalysis.identifier || "$"} was mapped into CALCULATE filter arguments.`);
      if (node.setAnalysis.identifier === "1") text = text.replace("CALCULATE(", "CALCULATE(").replace(/,\n    /, ",\n    REMOVEFILTERS(),\n    ");
    }
    return { text, confidence, issues, explanation, unsupported, missingDependency: merged.missingDependency };
  }

  private renderSet(node: SetAnalysisNode, context: DaxTranslationContext): RenderResult {
    const filters = this.setFilters(node, context);
    return { text: filters.filters.join(", "), ...combine(...filters.parts) };
  }

  private setFilters(node: SetAnalysisNode, context: DaxTranslationContext): { filters: string[]; parts: RenderResult[] } {
    const filters: string[] = [];
    const parts: RenderResult[] = [];
    for (const modifier of node.modifiers) {
      const table = this.resolveTable(modifier.field, context);
      const column = daxColumn(table, modifier.field);
      const values = modifier.values.map((v) => v.trim()).filter(Boolean);
      const range = values.find((v) => /[<>]=?/.test(v));
      if (range) {
        const raw = range.replace(/^['"]|['"]$/g, "");
        const conditions: string[] = [];
        for (const match of raw.matchAll(/(>=|<=|>|<|=)\s*(\$\([^)]+\)|[^<>=]+)/g)) {
          const rhsRaw = match[2].trim();
          const rhs = rhsRaw.startsWith("$(") ? this.renderVariable(rhsRaw.replace(/^\$\(\s*=?\s*/, "").replace(/\)$/, ""), context) : empty(/^[-+]?\d+(\.\d+)?$/.test(rhsRaw) ? rhsRaw : literal(rhsRaw));
          parts.push(rhs);
          conditions.push(`${column} ${match[1]} ${rhs.text}`);
        }
        filters.push(`FILTER(ALL(${column}), ${conditions.join(" && ") || "TRUE()"})`);
        continue;
      }
      const renderedValues = values.map((value) => {
        const cleaned = value.replace(/^['"]|['"]$/g, "");
        if (cleaned.startsWith("$(")) {
          const result = this.renderVariable(cleaned.replace(/^\$\(\s*=?\s*/, "").replace(/\)$/, ""), context);
          parts.push(result); return result.text;
        }
        return /^[-+]?\d+(?:\.\d+)?$/.test(cleaned) ? cleaned : literal(cleaned);
      });
      if (modifier.operator === "-=") filters.push(`KEEPFILTERS(NOT (${column} IN { ${renderedValues.join(", ")} }))`);
      else if (modifier.operator === "+=") filters.push(`KEEPFILTERS(${column} IN { ${renderedValues.join(", ")} })`);
      else if (renderedValues.length === 0) filters.push(`REMOVEFILTERS(${column})`);
      else filters.push(`KEEPFILTERS(${column} IN { ${renderedValues.join(", ")} })`);
    }
    return { filters, parts };
  }

  private classify(ast: ExpressionAstNode, source: string): DaxTranslationResult["artifactType"] {
    if (/background|text.?color|colour|format/i.test(source)) return "conditional-formatting";
    if (ast.kind === "function" && ["sum", "count", "avg", "average", "min", "max", "median", "only", "aggr"].includes(ast.name.toLowerCase())) return "measure";
    if (/\b(sum|count|avg|min|max|aggr|rangesum)\s*\(/i.test(source)) return "measure";
    return "calculated-column";
  }
}
