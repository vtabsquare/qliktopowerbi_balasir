import type { AgentChangeProposal, MigrationAgentAnswer, MigrationAgentContext } from "./types";

function confidence(context: MigrationAgentContext): MigrationAgentAnswer["confidence"] {
  if (context.validation.readyForExport && context.validation.errorCount === 0) return "Very high";
  if (context.diagnostics.some((d) => d.severity === "blocking-error")) return "High";
  if (context.finalTables.length) return "Moderate";
  return "Low";
}

function createProposal(context: MigrationAgentContext, issue: string, proposedDefinition?: string): AgentChangeProposal {
  return {
    proposalId: `PROP-${Date.now().toString(36)}`,
    objectType: "m-query",
    objectId: context.selectedTable || "project",
    issue,
    evidence: context.diagnostics.slice(0, 4).map((d) => d.message),
    currentDefinition: context.generatedM,
    proposedDefinition,
    affectedObjects: context.selectedTable ? [context.selectedTable] : context.finalTables.map((t) => t.name),
    riskLevel: "medium",
    confidence: 82,
    validationsRequired: ["M syntax", "Named-query dependencies", "Output schema", "10-row preview", "Downstream model references"],
    rollbackAvailable: true,
    status: "proposed",
  };
}

export function answerDeterministically(context: MigrationAgentContext): MigrationAgentAnswer {
  const q = context.userQuestion.toLowerCase();
  const selected = context.selectedTable ? context.finalTables.find((t) => t.name === context.selectedTable) : undefined;
  const blocking = context.diagnostics.filter((d) => d.severity === "blocking-error");

  if (q.includes("final table") || q.includes("tables")) {
    const names = context.finalTables.map((t) => `${t.name} (${t.fields.length} columns)`).join(", ") || "No final tables are currently resolved.";
    return {
      finding: `The project currently resolves ${context.finalTables.length} final table(s).`,
      evidence: context.finalTables.map((t) => `${t.name}: ${t.fields.join(", ")}`).slice(0, 12),
      impact: context.finalTables.length ? "These tables are candidates for loading into the Power BI semantic model." : "PBIP export cannot be trusted until final-table detection succeeds.",
      recommendedAction: context.finalTables.length ? "Review lineage, datatypes and generated M for each final table before export." : "Re-run parsing and inspect unresolved LOAD, RESIDENT, JOIN and STORE statements.",
      validationRequired: ["Final-table classification", "Column inheritance", "QVD lineage", "M schema"],
      confidence: confidence(context),
      answer: names,
      provider: "deterministic",
    };
  }

  if (q.includes("lineage") || q.includes("created") || q.includes("derive")) {
    return {
      finding: selected ? `${selected.name} has a resolved lineage chain.` : "Select a table to retrieve its exact lineage.",
      evidence: selected ? [selected.lineage, ...selected.joins, ...selected.calculations] : context.finalTables.map((t) => t.name),
      impact: "Lineage determines which source, staging, mapping, join and calculation steps must be reproduced in Power Query.",
      recommendedAction: selected ? "Compare the execution plan and generated M step-by-step, then run preview and reconciliation." : "Choose a final table in the current page and ask again.",
      validationRequired: ["Upstream source resolution", "Wildcard expansion", "Join attachment", "Calculated-column registration"],
      confidence: selected ? "High" : "Low",
      answer: selected?.lineage || "No selected table context was supplied.",
      provider: "deterministic",
    };
  }

  if (q.includes("fix") || q.includes("error") || q.includes("invalid") || q.includes("missing")) {
    const issue = blocking[0] || context.diagnostics[0];
    const finding = issue?.message || "No deterministic blocking diagnostic is currently available for the selected scope.";
    return {
      finding,
      evidence: context.diagnostics.slice(0, 6).map((d) => `${d.category}: ${d.message}`),
      impact: blocking.length ? "The affected query cannot be treated as refresh-ready and export should remain blocked." : "The project requires targeted validation before any change is applied.",
      recommendedAction: issue?.recommendation || "Run deterministic M validation, inspect dependencies and propose the smallest safe patch.",
      validationRequired: ["M lexical and syntax validation", "Dependency validation", "Schema validation", "Preview execution"],
      confidence: issue ? "High" : "Moderate",
      answer: issue ? `${finding}\n\nRecommended action: ${issue.recommendation || "Review the highlighted line and dependency graph."}` : finding,
      proposal: issue ? createProposal(context, finding) : undefined,
      provider: "deterministic",
    };
  }

  return {
    finding: selected ? `The assistant is grounded on ${selected.name} and the current migration graph.` : "The assistant is grounded on the current project summary.",
    evidence: [
      `${context.projectSummary.artifactCount} artifacts`,
      `${context.projectSummary.finalTableCount} final tables`,
      `${context.projectSummary.blockingIssues} blocking issues`,
      ...context.diagnostics.slice(0, 3).map((d) => d.message),
    ],
    impact: "The response uses current application metadata; unsupported or missing evidence remains explicitly unverified.",
    recommendedAction: "Ask for final tables, complete lineage, a specific Power Query error, datatype impact, or export blockers.",
    validationRequired: ["Use deterministic validators before applying generated code"],
    confidence: confidence(context),
    answer: "I can explain the current project, trace a selected table, diagnose M/DAX issues and create a governed change proposal. Select a table or ask about a blocking issue for a more specific result.",
    provider: "deterministic",
  };
}
