import type { EnterpriseAnalysis } from "../enterprise-parser";
import { buildMigrationAgentContext } from "../agent/types";
import { sendMigrationAgentMessage } from "../agent/client";

function extractCandidate(value: string): string | null {
  const fenced = value.match(/```(?:dax)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) return fenced;
  const json = value.match(/\{[\s\S]*\}/)?.[0];
  if (json) {
    try {
      const parsed = JSON.parse(json) as { dax?: string; repairedDax?: string; expression?: string };
      return parsed.repairedDax || parsed.dax || parsed.expression || null;
    } catch {
      // A prose response is not executable DAX and is intentionally ignored.
    }
  }
  return null;
}

export async function requestAiDaxRepair(args: {
  analysis: EnterpriseAnalysis;
  measureName: string;
  table: string;
  expression: string;
  validationErrors: string[];
}): Promise<string | null> {
  const message = [
    "Repair one Power BI DAX measure. Return only JSON with a repairedDax property or one fenced dax block.",
    "Do not invent tables, columns, or measures. Preserve business meaning. If evidence is insufficient, return no expression.",
    `Measure: ${args.measureName}`,
    `Home table: ${args.table}`,
    `Current DAX: ${args.expression}`,
    `Validation errors: ${args.validationErrors.join("; ")}`,
  ].join("\n");
  const answer = await sendMigrationAgentMessage({
    message,
    context: buildMigrationAgentContext({
      question: message,
      currentPage: "/app/dax-measures",
      selectedTable: args.table,
      analysis: args.analysis,
    }),
  });
  return answer.proposal?.proposedDefinition?.trim()
    || extractCandidate(answer.answer)
    || extractCandidate(answer.recommendedAction)
    || null;
}
