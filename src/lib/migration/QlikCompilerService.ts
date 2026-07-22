import {
  applyDataTypeOverrides,
  type EnterpriseAnalysis,
} from "./enterprise-parser";

export const QLIK_COMPILER_VERSION = "6.4.0-user-controlled-calendar-builder";

export interface CompilerFingerprint {
  compilerVersion: string;
  sourceArtifactHash: string;
  datatypeContractHash: string;
  executionPlanHash: string;
  generatedMHash: string;
  projectRevision: string;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

export function deterministicHash(value: unknown): string {
  const text = typeof value === "string" ? value : stable(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

function currentTypeUpdates(analysis: EnterpriseAnalysis): Record<string, string> {
  const updates: Record<string, string> = {};
  for (const [table, columns] of Object.entries(analysis.columnTypes || {})) {
    for (const [column, type] of Object.entries(columns || {})) updates[`${table}.${column}`] = type;
  }
  return updates;
}

export function compileAuthoritatively(analysis: EnterpriseAnalysis): EnterpriseAnalysis {
  // This is the only supported compilation entry point. It rebuilds execution
  // plans and M from the parsed Qlik operations plus the latest datatype map.
  return applyDataTypeOverrides(analysis, currentTypeUpdates(analysis));
}

export function compilerFingerprint(analysis: EnterpriseAnalysis): CompilerFingerprint {
  const files = (analysis.inventory?.files || []).map((file) => ({
    path: file.path,
    size: file.size,
    content: file.text || "",
  }));
  return {
    compilerVersion: QLIK_COMPILER_VERSION,
    sourceArtifactHash: deterministicHash(files),
    datatypeContractHash: deterministicHash(analysis.columnTypes || {}),
    executionPlanHash: deterministicHash(analysis.executionPlans || {}),
    generatedMHash: deterministicHash(analysis.mQueries || {}),
    projectRevision: deterministicHash({ operations: analysis.operations, variables: analysis.variables, profiles: analysis.profiles }),
  };
}

function calendarDateRemovalOffsets(query: string): number[] {
  const offsets: number[] = [];
  const tokenPatterns = [
    /\{\{\s*"CalendarDate"\s*,/gi,
    /\{\s*"CalendarDate"\s*\}/gi,
  ];
  for (const pattern of tokenPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(query)) !== null) {
      const windowStart = Math.max(0, match.index - 600);
      const prefix = query.slice(windowStart, match.index);
      const rename = prefix.lastIndexOf("Table.RenameColumns(");
      const remove = prefix.lastIndexOf("Table.RemoveColumns(");
      const select = prefix.lastIndexOf("Table.SelectColumns(");
      const operation = Math.max(rename, remove, select);
      if (operation < 0) continue;
      // SelectColumns is only a removal boundary when CalendarDate is absent
      // from its selected output. A literal CalendarDate inside SelectColumns is
      // therefore not considered a removal.
      if (operation === select) continue;
      offsets.push(windowStart + operation);
    }
  }
  return [...new Set(offsets)].sort((a, b) => a - b);
}

function calendarDateReferenceOffsets(query: string): number[] {
  const offsets: number[] = [];
  // Only count executable references to the input column. Mentions in a rename,
  // final projection, datatype signature, comments, or output-column lists are
  // not dependencies and must not trigger a false compiler invariant failure.
  const patterns = [
    /Record\.Field(?:OrDefault)?\(\s*_\s*,\s*"CalendarDate"/gi,
    /Record\.Field(?:OrDefault)?\([^)]*,\s*"CalendarDate"/gi,
    /\[\s*CalendarDate\s*\]/gi,
    /Table\.Column\([^,]+,\s*"CalendarDate"\s*\)/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(query)) !== null) offsets.push(match.index);
  }
  return offsets.sort((a, b) => a - b);
}

export function collectCompilerInvariantIssues(analysis: EnterpriseAnalysis): string[] {
  const issues: string[] = [];
  for (const [table, query] of Object.entries(analysis.mQueries || {})) {
    if (/QLIK2PBI\.ManualSource/.test(query)) issues.push(`${table}: unresolved ManualSource`);
    if (/Table\.SelectColumns\([^\n]+\{[^}]*"WeekDay"[^}]*"Right"/i.test(query)) issues.push(`${table}: function names were classified as source columns`);
    if (!/\bin\s+ReviewedTypeConversions\s*$/i.test(query)) issues.push(`${table}: latest datatype contract is not the final output`);

    if (/calendar|dimdate|date_dimension/i.test(table)) {
      const removals = calendarDateRemovalOffsets(query);
      const references = calendarDateReferenceOffsets(query);
      const firstRemoval = removals[0];
      const invalidReference = firstRemoval === undefined ? undefined : references.find((offset) => offset > firstRemoval);
      if (invalidReference !== undefined) {
        issues.push(`${table}: CalendarDate is removed before its final dependent calculation`);
      }
    }
  }

  for (const plan of Object.values(analysis.executionPlans || {})) {
    for (const join of plan.joins || []) {
      const overlap = (join.expandColumns || []).filter((field) => (join.keyColumns || []).some((key) => key.toLowerCase() === field.toLowerCase()));
      if (overlap.length) issues.push(`${plan.finalTable}: join payload contains key column(s): ${overlap.join(", ")}`);
      const targetRequired = join.keyColumns || [];
      const payloadInTarget = (join.expandColumns || []).filter((field) => targetRequired.some((key) => key.toLowerCase() === field.toLowerCase()));
      if (payloadInTarget.length) issues.push(`${plan.finalTable}: payload fields leaked into target join keys: ${payloadInTarget.join(", ")}`);
    }
  }
  return issues;
}

export function assertCompilerInvariants(analysis: EnterpriseAnalysis): void {
  const issues = collectCompilerInvariantIssues(analysis);
  if (issues.length) throw new Error(`Authoritative compiler invariant failure:\n${issues.join("\n")}`);
}
