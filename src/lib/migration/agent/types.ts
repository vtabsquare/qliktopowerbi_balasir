import type { EnterpriseAnalysis } from "../enterprise-parser";

export type AgentSeverity = "blocking-error" | "error" | "warning" | "information";
export type AgentRisk = "low" | "medium" | "high" | "critical";

export interface MigrationAgentContext {
  projectId: string;
  projectVersionId: string;
  currentPage: string;
  selectedTable?: string;
  userQuestion: string;
  projectSummary: {
    name: string;
    route: string;
    artifactCount: number;
    finalTableCount: number;
    blockingIssues: number;
    warnings: number;
  };
  finalTables: Array<{ name: string; fields: string[]; lineage: string; joins: string[]; calculations: string[] }>;
  generatedM?: string;
  diagnostics: Array<{ severity: AgentSeverity; category: string; message: string; recommendation?: string; table?: string }>;
  validation: { readyForExport: boolean; errorCount: number; warningCount: number };
}

export interface AgentChangeProposal {
  proposalId: string;
  objectType: "m-query" | "dax" | "datatype" | "source" | "join" | "relationship" | "mapping";
  objectId: string;
  issue: string;
  evidence: string[];
  currentDefinition?: string;
  proposedDefinition?: string;
  affectedObjects: string[];
  riskLevel: AgentRisk;
  confidence: number;
  validationsRequired: string[];
  rollbackAvailable: true;
  status: "proposed" | "approved" | "rejected" | "applied";
}

export interface MigrationAgentAnswer {
  finding: string;
  evidence: string[];
  impact: string;
  recommendedAction: string;
  validationRequired: string[];
  confidence: "Low" | "Moderate" | "High" | "Very high" | "Verified";
  answer: string;
  proposal?: AgentChangeProposal;
  provider: "deterministic" | "openai";
}

export interface AgentMessageRequest {
  message: string;
  context: MigrationAgentContext;
  conversationId?: string;
}

export function buildMigrationAgentContext(args: {
  question: string;
  currentPage: string;
  selectedTable?: string;
  projectName?: string;
  projectId?: string;
  projectVersion?: number;
  analysis: EnterpriseAnalysis | null;
}): MigrationAgentContext {
  const { analysis, selectedTable } = args;
  const profile = selectedTable ? analysis?.profiles[selectedTable] : undefined;
  const diagnostics = [
    ...(analysis?.mQueryDiagnostics ?? []).map((item) => ({
      severity: (String(item.severity || "warning").includes("block") ? "blocking-error" : "warning") as AgentSeverity,
      category: String(item.category || item.area || "m-query"),
      message: String(item.message || item.error || "Power Query diagnostic"),
      recommendation: String(item.recommendation || ""),
      table: String(item.table || item.objectName || ""),
    })),
    ...(analysis?.validation.issues ?? []).map((item) => ({
      severity: (String(item.severity).toLowerCase().includes("error") ? "blocking-error" : "warning") as AgentSeverity,
      category: item.area,
      message: item.message,
      recommendation: item.recommendation,
      table: item.objectName,
    })),
  ].filter((item) => !selectedTable || !item.table || item.table === selectedTable).slice(0, 30);

  return {
    projectId: args.projectId || "local-project",
    projectVersionId: String(args.projectVersion || 1),
    currentPage: args.currentPage,
    selectedTable,
    userQuestion: args.question,
    projectSummary: {
      name: args.projectName || "Qlik Migration Project",
      route: analysis?.inventory.files.some((file) => file.ext.toLowerCase() === ".qvw") ? "QlikView application" : "QVS / metadata migration",
      artifactCount: analysis?.inventory.totalFiles ?? 0,
      finalTableCount: analysis?.finalTables.length ?? 0,
      blockingIssues: analysis?.validation.errorCount ?? 0,
      warnings: analysis?.validation.warningCount ?? 0,
    },
    finalTables: (analysis?.finalTables ?? []).map((table) => ({
      name: table.table,
      fields: table.fields,
      lineage: table.lineageScript || table.etlStory,
      joins: table.joinLogic,
      calculations: table.calculatedColumns,
    })),
    generatedM: selectedTable ? analysis?.mQueries[selectedTable] : undefined,
    diagnostics,
    validation: {
      readyForExport: analysis?.validation.isReadyForPbipExport ?? false,
      errorCount: analysis?.validation.errorCount ?? 0,
      warningCount: analysis?.validation.warningCount ?? 0,
    },
  };
}
