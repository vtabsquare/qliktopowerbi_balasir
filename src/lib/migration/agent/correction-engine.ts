import type { EnterpriseAnalysis } from "../enterprise-parser";
import type { AgentRisk } from "./types";
import { PowerQueryCompilerRepairEngine } from "../power-query/PowerQueryCompilerRepairEngine";

export type CorrectionStatus =
  | "Detected" | "Diagnosed" | "Correction Proposed" | "Awaiting Approval"
  | "Applying" | "Regenerating" | "Validating" | "Technically Validated"
  | "Reconciliation Required" | "Semantically Verified" | "Failed"
  | "Rolled Back" | "Manual Review Required";

export interface CorrectionDiagnostic {
  id: string;
  table: string;
  code: string;
  message: string;
  severity: string;
  category: string;
  line?: number;
  token?: string;
  recommendation?: string;
}

export interface QlikScriptEvidence {
  evidenceId: string;
  file: string;
  startLine: number;
  endLine: number;
  excerptStartLine: number;
  lines: string[];
  highlightedLines: number[];
  tokens: string[];
  operationId?: string;
  operationType?: string;
  table?: string;
  reason: string;
}

export interface PatchOperation {
  kind: "replace" | "insert-query" | "regenerate" | "datatype" | "manual-review";
  search?: string;
  replacement?: string;
  queryName?: string;
  code?: string;
  description: string;
}

export interface AiCorrectionProposal {
  proposalId: string;
  projectId: string;
  projectVersion: string;
  diagnosticId: string;
  targetType: "M" | "DAX" | "datatype" | "join" | "relationship" | "metadata";
  targetObject: string;
  finding: string;
  rootCause: string;
  evidence: string[];
  qlikScriptEvidence: QlikScriptEvidence[];
  originalCode: string;
  correctedCode: string;
  patchOperations: PatchOperation[];
  affectedObjects: string[];
  riskLevel: AgentRisk;
  confidence: number;
  requiredValidations: string[];
  status: CorrectionStatus;
  rollbackAvailable: boolean;
}

export interface CorrectionValidationResult {
  passed: string[];
  failed: string[];
  pending: string[];
  status: CorrectionStatus;
}

function diagnosticRows(analysis: EnterpriseAnalysis): CorrectionDiagnostic[] {
  const rows = [
    ...(analysis.mQueryDiagnostics ?? []).map((d, i) => ({
      id: String(d.id || `M-${i + 1}`), table: String(d.table || d.objectName || ""),
      code: String(d.code || d.category || "M_DIAGNOSTIC"), message: String(d.message || d.error || "Power Query error"),
      severity: String(d.severity || "error"), category: String(d.category || d.area || "m-query"),
      line: Number(d.line || d.startLine || 0) || undefined, token: String(d.offendingToken || d.token || "") || undefined,
      recommendation: String(d.recommendation || "") || undefined,
    })),
    ...(analysis.validation.issues ?? []).map((d, i) => ({
      id: String(d.id || `V-${i + 1}`), table: String(d.objectName || ""), code: String(d.area || "VALIDATION"),
      message: String(d.message), severity: String(d.severity), category: String(d.area), recommendation: String(d.recommendation || "") || undefined,
    })),
  ];
  const seen = new Set<string>();
  return rows.filter((r) => { const k = `${r.table}|${r.message}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export function listCorrectionDiagnostics(analysis: EnterpriseAnalysis | null, table?: string): CorrectionDiagnostic[] {
  if (!analysis) return [];
  return diagnosticRows(analysis).filter((d) => !table || !d.table || d.table === table);
}

function allQueryNames(analysis: EnterpriseAnalysis): string[] {
  return Object.keys(analysis.mQueries ?? {});
}

function cleanMissingQueryName(value: string): string {
  return value
    .trim()
    .replace(/^#?["']|["']$/g, "")
    .replace(/^(?:query|queries)\s*[:=-]\s*/i, "")
    .replace(/[.。,;:]+$/g, "")
    .trim();
}

function findUnknownQuery(message: string, token?: string): string | undefined {
  if (token) {
    const cleaned = cleanMissingQueryName(token);
    if (cleaned) return cleaned;
  }
  const patterns = [
    /unknown named query\/queries\s*[:=-]\s*#?["']?([^"'\r\n,;]+)["']?/i,
    /unknown named quer(?:y|ies)\s*[:=-]\s*#?["']?([^"'\r\n,;]+)["']?/i,
    /missing quer(?:y|ies)\s*[:=-]\s*#?["']?([^"'\r\n,;]+)["']?/i,
    /query\s+["']([^"']+)["']\s+(?:was not found|does not exist)/i,
    /reference(?:s)?\s+(?:to\s+)?(?:unknown\s+named\s+)?quer(?:y|ies)\s*[:=-]?\s*#?["']?([^"'\r\n,;]+)["']?/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const cleaned = cleanMissingQueryName(match[1]);
      if (cleaned) return cleaned;
    }
  }
  return undefined;
}

function closestName(target: string, names: string[]): string | undefined {
  const normalized = target.toLowerCase().replace(/[^a-z0-9]/g, "");
  return names.find((n) => n.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized)
    || names.find((n) => n.toLowerCase().includes(target.toLowerCase()) || target.toLowerCase().includes(n.toLowerCase()));
}

function replaceQueryReference(code: string, missing: string, replacement: string): string {
  return code
    .replaceAll(`#"${missing}"`, `#"${replacement}"`)
    .replace(new RegExp(`\\b${missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), replacement);
}

function canonicalName(value: string | null | undefined): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function canonicalSourceRef(value: string): string {
  return value.toLowerCase().replace(/\\/g, "/").replace(/\$\([^)]+\)/g, "").split("/").pop() || "";
}

function resolveMappingLookup(analysis: EnterpriseAnalysis, missing: string): {
  queryName: string;
  code: string;
  sourceQuery: string;
  keyColumn: string;
  valueColumn: string;
  confidence: number;
} | undefined {
  const operations = analysis.operations ?? [];
  const mappingOp = operations.find((operation) =>
    operation.opType === "mapping_load" && canonicalName(operation.table) === canonicalName(missing),
  );
  if (!mappingOp) return undefined;

  const keyColumn = mappingOp.fields?.[0];
  const valueColumn = mappingOp.fields?.[1];
  if (!keyColumn || !valueColumn) return undefined;

  const qvdInput = mappingOp.qvdInputs?.[0] || mappingOp.sourceRefs?.find((source) => /\.qvd$/i.test(source));
  const producer = qvdInput
    ? operations.find((operation) => (operation.qvdOutputs ?? []).some((output) => canonicalSourceRef(output) === canonicalSourceRef(qvdInput)))
    : undefined;

  const queryNames = Object.keys(analysis.mQueries ?? {});
  const preferredNames = [
    producer?.table ? `Source_${producer.table}` : "",
    producer?.table || "",
    `Source_${mappingOp.table}`,
  ].filter(Boolean);

  let sourceQuery = queryNames.find((name) => preferredNames.some((preferred) => canonicalName(name) === canonicalName(preferred)));
  if (!sourceQuery) {
    sourceQuery = queryNames
      .filter((name) => canonicalName(name) !== canonicalName(missing))
      .map((name) => {
        const fields = analysis.profiles?.[name]?.fields ?? [];
        const fieldScore = Number(fields.includes(keyColumn)) + Number(fields.includes(valueColumn));
        const producerScore = producer && canonicalName(name).includes(canonicalName(producer.table)) ? 3 : 0;
        return { name, score: fieldScore * 10 + producerScore };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score)[0]?.name;
  }
  if (!sourceQuery) return undefined;

  return {
    queryName: missing,
    sourceQuery,
    keyColumn,
    valueColumn,
    confidence: producer ? 96 : 84,
    code: `let
    Source = #"${sourceQuery}",
    SelectedColumns = Table.SelectColumns(Source, {"${keyColumn}", "${valueColumn}"}, MissingField.Error),
    ValidKeys = Table.SelectRows(SelectedColumns, each Record.FieldOrDefault(_, "${keyColumn}", null) <> null),
    Lookup = Table.Distinct(ValidKeys, {"${keyColumn}"})
in
    Lookup`,
  };
}


function uniqueTokens(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => String(value || "").split(/[,;|]/g)).map((value) => value.trim()).filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Resolve diagnostics back to the authoritative Qlik statements.  This is
 * deliberately metadata-driven: operation file/line ranges are produced by
 * the Qlik parser and no project-specific table or field name is assumed.
 */
export function buildQlikScriptEvidence(
  analysis: EnterpriseAnalysis,
  diagnostic: CorrectionDiagnostic,
  targetTable: string,
  missingQuery?: string,
): QlikScriptEvidence[] {
  const target = canonicalName(targetTable);
  const missing = canonicalName(missingQuery || "");
  const diagnosticToken = canonicalName(diagnostic.token || "");
  const candidates = (analysis.operations ?? []).map((operation) => {
    let score = 0;
    const reasons: string[] = [];
    if (target && canonicalName(operation.table) === target) { score += 25; reasons.push("produces the affected table"); }
    if (target && canonicalName(operation.joinTarget) === target) { score += 18; reasons.push("joins into the affected table"); }
    if (target && canonicalName(operation.concatTarget) === target) { score += 18; reasons.push("concatenates into the affected table"); }
    if (missing && canonicalName(operation.table) === missing) { score += 80; reasons.push("defines the missing named dependency"); }
    if (missing && operation.opType === "mapping_load" && canonicalName(operation.table) === missing) { score += 35; reasons.push("is the original Qlik MAPPING LOAD"); }
    const searchable = [operation.raw, operation.resolvedRaw, ...(operation.applymaps || []), ...Object.values(operation.fieldExpressions || {})].join(" ").toLowerCase();
    if (missingQuery && searchable.includes(missingQuery.toLowerCase())) { score += 35; reasons.push("references the missing dependency"); }
    if (diagnostic.token && searchable.includes(diagnostic.token.toLowerCase())) { score += 20; reasons.push("contains the offending token"); }
    if (diagnosticToken && (operation.fields || []).some((field) => canonicalName(field) === diagnosticToken)) { score += 10; reasons.push("contains the affected field"); }
    return { operation, score, reason: reasons.join("; ") };
  }).filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.operation.startLine - right.operation.startLine)
    .slice(0, 6);

  const files = new Map((analysis.inventory?.files ?? []).map((file) => [file.path.toLowerCase(), file]));
  const seen = new Set<string>();
  return candidates.flatMap(({ operation, reason }) => {
    const operationFile = String(operation.file || "unknown-script.qvs");
    const key = `${operationFile.toLowerCase()}|${operation.startLine || 1}|${operation.endLine || operation.startLine || 1}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const file = files.get(operationFile.toLowerCase())
      || (analysis.inventory?.files ?? []).find((item) => item.path.toLowerCase().endsWith(operationFile.toLowerCase()));
    const allLines = String(file?.content || operation.raw || "").split(/\r?\n/);
    const start = Math.max(1, operation.startLine || 1);
    const end = Math.max(start, operation.endLine || start);
    const excerptStart = Math.max(1, start - 2);
    const excerptEnd = Math.min(allLines.length || end, end + 2);
    const excerpt = allLines.slice(excerptStart - 1, excerptEnd);
    const tokens = uniqueTokens([
      missingQuery,
      diagnostic.token,
      operation.table,
      ...(operation.applymaps || []),
      ...(operation.fields || []).filter((field) => diagnostic.message.toLowerCase().includes(field.toLowerCase())),
    ]);
    return [{
      evidenceId: `QLIK-${operation.id}-${start}`,
      file: operationFile,
      startLine: start,
      endLine: end,
      excerptStartLine: excerptStart,
      lines: excerpt,
      highlightedLines: Array.from({ length: end - start + 1 }, (_, index) => start + index),
      tokens,
      operationId: operation.id,
      operationType: operation.opType,
      table: operation.table,
      reason: reason || "Parser lineage links this Qlik statement to the affected object.",
    }];
  });
}

export class AiCorrectionEngine {
  private readonly compilerRepair = new PowerQueryCompilerRepairEngine();
  diagnose(analysis: EnterpriseAnalysis, diagnosticId: string): CorrectionDiagnostic {
    const diagnostic = diagnosticRows(analysis).find((d) => d.id === diagnosticId);
    if (!diagnostic) throw new Error("The selected diagnostic is no longer available. Re-run validation.");
    return diagnostic;
  }

  propose(args: { analysis: EnterpriseAnalysis; diagnosticId: string; projectId: string; projectVersion: string }): AiCorrectionProposal {
    const d = this.diagnose(args.analysis, args.diagnosticId);
    const table = d.table || Object.keys(args.analysis.mQueries ?? {})[0] || "project";
    const current = args.analysis.mQueries?.[table] || "";
    const names = allQueryNames(args.analysis);
    const missing = findUnknownQuery(d.message, d.token);
    let corrected = current;
    let rootCause = d.message;
    let operations: PatchOperation[] = [];
    let risk: AgentRisk = "medium";
    let confidence = 72;
    let targetType: AiCorrectionProposal["targetType"] = "M";

    const compilerResult = current ? this.compilerRepair.repair(args.analysis, table, { maxIterations: 5, allowSourceInference: true }) : undefined;
    const hasCompilerRepair = Boolean(compilerResult && compilerResult.appliedPatches.length > 0 && compilerResult.correctedCode !== current);

    if (hasCompilerRepair && compilerResult) {
      corrected = compilerResult.correctedCode;
      rootCause = compilerResult.appliedPatches.map((p) => p.description).join(" ");
      operations = [{
        kind: "replace",
        search: current,
        replacement: corrected,
        description: `Apply ${compilerResult.appliedPatches.length} compiler-guided repair(s) and synchronize the generated query with the inferred canonical metadata.`,
      }];
      risk = compilerResult.appliedPatches.every((p) => p.safe) ? "low" : "medium";
      confidence = compilerResult.inferredSource?.confidence ?? 90;
      targetType = "M";
    } else if (missing && current) {
      const replacement = closestName(missing, names.filter((n) => n !== table));
      if (replacement) {
        corrected = replaceQueryReference(current, missing, replacement);
        rootCause = `The generated query references '${missing}', but the available canonical query is '${replacement}'. The reference became stale or was emitted with a non-canonical name.`;
        operations = [{ kind: "replace", search: missing, replacement, description: `Replace the unresolved query reference '${missing}' with '${replacement}'.` }];
        risk = "low"; confidence = 94;
      } else {
        const mapping = resolveMappingLookup(args.analysis, missing);
        if (mapping) {
          rootCause = `The Qlik script defines '${missing}' as a MAPPING LOAD, but the generated Power Query references it without generating the required lookup query.`;
          operations = [{
            kind: "insert-query",
            queryName: mapping.queryName,
            code: mapping.code,
            description: `Generate '${mapping.queryName}' from '${mapping.sourceQuery}' using key '${mapping.keyColumn}' and value '${mapping.valueColumn}'.`,
          }];
          corrected = current;
          risk = "low";
          confidence = mapping.confidence;
        } else {
          const profile = args.analysis.profiles?.[missing] || args.analysis.profiles?.[table];
          const fields = (profile?.fields || []).slice(0, 2);
          const source = names.find((name) => name !== table && fields.some((field) => args.analysis.profiles?.[name]?.fields?.includes(field)));
          if (source && fields.length >= 2) {
            const lookup = `let
    Source = #"${source}",
    Lookup = Table.SelectColumns(Source, {"${fields[0]}", "${fields[1]}"}, MissingField.Error)
in
    Lookup`;
            rootCause = `The migration graph contains a dependency on '${missing}', but no Power Query definition was generated for that lookup.`;
            operations = [{ kind: "insert-query", queryName: missing, code: lookup, description: `Create the missing lookup query '${missing}' from '${source}'.` }];
            corrected = current;
            risk = "medium";
            confidence = 80;
          } else {
            operations = [{ kind: "manual-review", description: `No grounded producer was found for '${missing}'. Source mapping or parser metadata must be corrected.` }];
            risk = "high";
            confidence = 45;
          }
        }
      }
    } else if (/duplicate|already exists|field.*exists/i.test(d.message) && current) {
      const token = d.token || "ExpandedColumn";
      const replacement = `${token}_Lookup`;
      corrected = current.replace(new RegExp(`"${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g"), `"${replacement}"`);
      rootCause = `A join expansion attempts to create '${token}', which collides with an existing column name.`;
      operations = [{ kind: "replace", search: token, replacement, description: `Rename the colliding expansion output to '${replacement}' and preserve downstream uniqueness.` }];
      risk = "low"; confidence = 88;
    } else if (/column.*not found|missing column|field.*not found/i.test(d.message)) {
      rootCause = "The generated object references a field that is absent from the resolved upstream schema. The parser graph must be checked for rename, drop, wildcard inheritance, or join expansion loss.";
      operations = [{ kind: "regenerate", description: "Rebuild wildcard schema inheritance and the table execution plan, then regenerate the target query." }];
      targetType = "metadata"; risk = "medium"; confidence = 78;
    } else if (/dax|measure|expression/i.test(d.category + " " + d.message)) {
      targetType = "DAX"; rootCause = "The translated expression did not pass semantic or reference validation.";
      operations = [{ kind: "manual-review", description: "Reparse the Qlik expression with visual/date context and generate a semantically classified DAX patch." }];
      risk = "high"; confidence = 55;
    } else {
      operations = [{ kind: "regenerate", description: "Rebuild the canonical execution plan and regenerate the affected object before applying any direct code override." }];
      targetType = "metadata"; risk = "medium"; confidence = 65;
    }

    const qlikScriptEvidence = buildQlikScriptEvidence(args.analysis, d, table, missing);

    return {
      proposalId: `AIC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      projectId: args.projectId, projectVersion: args.projectVersion, diagnosticId: d.id,
      targetType, targetObject: table, finding: d.message, rootCause,
      evidence: [
        d.message,
        d.recommendation || "No explicit parser recommendation",
        `Available queries: ${names.join(", ") || "none"}`,
        ...(compilerResult?.inferredSource ? [`Inferred source: ${compilerResult.inferredSource.queryName}[${compilerResult.inferredSource.dateColumn}] (${compilerResult.inferredSource.confidence}% evidence score)`] : []),
        ...(compilerResult?.remainingDiagnostics ?? []).map((x) => `${x.code}: ${x.message}`),
      ],
      qlikScriptEvidence,
      originalCode: current, correctedCode: corrected, patchOperations: operations,
      affectedObjects: [table, ...(compilerResult?.inferredSource ? [compilerResult.inferredSource.queryName] : [])], riskLevel: risk, confidence,
      requiredValidations: targetType === "DAX"
        ? ["DAX syntax", "Object references", "Measure dependencies", "Date and visual context", "Semantic reconciliation"]
        : ["M syntax", "Named-query dependencies", "Output schema", "Datatype compatibility", "10-row preview", "Downstream references"],
      status: "Awaiting Approval", rollbackAvailable: true,
    };
  }

  apply(analysis: EnterpriseAnalysis, proposal: AiCorrectionProposal): { analysis: EnterpriseAnalysis; validation: CorrectionValidationResult; previous: EnterpriseAnalysis } {
    const previous = structuredClone(analysis);
    const next = structuredClone(analysis);
    const failed: string[] = [];
    const passed: string[] = [];

    for (const op of proposal.patchOperations) {
      if (op.kind === "replace" && proposal.correctedCode) {
        next.mQueries[proposal.targetObject] = proposal.correctedCode;
        passed.push("Correction patch applied");
      } else if (op.kind === "insert-query" && op.queryName && op.code) {
        next.mQueries[op.queryName] = op.code;
        passed.push(`Generated query '${op.queryName}' added`);
      } else if (op.kind === "regenerate") {
        passed.push("Canonical regeneration requested");
      } else if (op.kind === "manual-review") {
        failed.push("The correction requires additional project evidence or manual review");
      }
    }

    const code = next.mQueries?.[proposal.targetObject] || "";
    if (proposal.targetType === "M" && code) {
      if (/\blet\b[\s\S]*\bin\b/i.test(code)) passed.push("M structural validation passed"); else failed.push("M query does not contain a valid let/in structure");
      const unresolved = [...code.matchAll(/#"([^"]+)"/g)].map((m) => m[1]).filter((name) => !Object.hasOwn(next.mQueries, name) && !/^Changed Type|Source|Promoted Headers|Filtered Rows|Expanded|Merged|Added/i.test(name));
      if (unresolved.length) failed.push(`Unresolved named queries or steps: ${[...new Set(unresolved)].join(", ")}`); else passed.push("Named-query dependency check passed");
    }

    // Remove only the corrected deterministic diagnostic; unresolved validation remains visible.
    next.mQueryDiagnostics = (next.mQueryDiagnostics ?? []).filter((d) => String(d.id || "") !== proposal.diagnosticId && !(String(d.table || d.objectName || "") === proposal.targetObject && String(d.message || d.error || "") === proposal.finding));
    const status: CorrectionStatus = failed.length ? "Manual Review Required" : "Reconciliation Required";
    return { analysis: next, previous, validation: { passed, failed, pending: failed.length ? [] : ["Power Query runtime preview", "Qlik-to-Power BI data reconciliation", "PBIP open and refresh"], status } };
  }
}
