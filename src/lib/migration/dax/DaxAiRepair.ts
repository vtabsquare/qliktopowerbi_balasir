import type { EnterpriseAnalysis } from "../enterprise-parser";
import type { PowerBiTable } from "../model/PowerBiModelTypes";
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
  originalQlikExpression?: string;
  tables?: PowerBiTable[];
}): Promise<string | null> {
  const schemaLines = args.tables?.map(
    (t) => `  ${t.name}: [${t.columns.map((c) => c.name).join(", ")}]`,
  ) ?? [];

  const message = [
    "Repair one Power BI DAX measure. The expression may contain an untranslated Qlik function placeholder.",
    "Return ONLY a JSON object with key \"repairedDax\" containing valid Power BI DAX.",
    "Do NOT invent tables or columns — use only names from the schema below.",
    "If the original Qlik expression uses Peek(field, 0, table), convert it to MAX('Table'[Field]) as a row-last-value approximation.",
    "If you cannot safely repair it with the available schema, return {\"repairedDax\": null}.",
    `Measure name: ${args.measureName}`,
    `Home table: ${args.table}`,
    args.originalQlikExpression ? `Original Qlik expression: ${args.originalQlikExpression}` : "",
    `Current broken DAX: ${args.expression}`,
    `Validation errors: ${args.validationErrors.join("; ")}`,
    schemaLines.length ? `Available schema:\n${schemaLines.join("\n")}` : "",
  ].filter(Boolean).join("\n");

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
