import type { EnterpriseAnalysis } from "../enterprise-parser";
import { AiCorrectionEngine, type AiCorrectionProposal, type CorrectionValidationResult } from "./correction-engine";

const engine = new AiCorrectionEngine();
const history = new Map<string, EnterpriseAnalysis>();

export function createCorrectionProposal(args: { analysis: EnterpriseAnalysis; diagnosticId: string; projectId: string; projectVersion: string }) {
  return engine.propose(args);
}

export function applyCorrectionProposal(analysis: EnterpriseAnalysis, proposal: AiCorrectionProposal) {
  const result = engine.apply(analysis, proposal);
  history.set(proposal.proposalId, result.previous);
  return result;
}

export function rollbackCorrection(proposalId: string): { analysis?: EnterpriseAnalysis; validation: CorrectionValidationResult } {
  const analysis = history.get(proposalId);
  if (!analysis) return { validation: { passed: [], failed: ["Rollback snapshot was not found."], pending: [], status: "Failed" } };
  history.delete(proposalId);
  return { analysis, validation: { passed: ["Previous project state restored"], failed: [], pending: ["Re-run validation"], status: "Rolled Back" } };
}
