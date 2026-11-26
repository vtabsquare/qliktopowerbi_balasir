import { useEffect, useMemo, useState } from "react";
import { useMigration } from "@/lib/migration/store";
import { useAuth } from "@/contexts/AuthContext";
import { validatePowerBiModel } from "@/lib/migration/model";
import { isRequiredActionCompleted, validateStepCompletion } from "@/lib/migration/workflow-gating";
import { modelDaxInputs, validateDaxMeasures } from "@/lib/migration/dax";

export function useStageReadiness(stepId: number) {
  const { isDemo } = useAuth();
  const [revision, setRevision] = useState(0);
  const {
    enterpriseFiles,
    enterpriseAnalysis,
    qvwAnalysis,
    expressionInventory,
    powerBiModel,
  } = useMigration();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => setRevision((r) => r + 1);
    window.addEventListener("workflow-step-completed", bump);
    window.addEventListener("pq-workflow-state-changed", bump);
    return () => {
      window.removeEventListener("workflow-step-completed", bump);
      window.removeEventListener("pq-workflow-state-changed", bump);
    };
  }, []);

  return useMemo(() => {
    const validatedModel = powerBiModel ? validatePowerBiModel(powerBiModel) : null;
    const modelInputs = validatedModel ? modelDaxInputs(validatedModel.tables) : [];
    const known = new Set(modelInputs.map((measure) => `${measure.table.toLowerCase()}::${measure.name.toLowerCase()}`));
    const enterpriseInputs = (enterpriseAnalysis?.daxMeasures ?? [])
      .filter((measure) => !known.has(`${measure.table.toLowerCase()}::${measure.measureName.toLowerCase()}`))
      .map((measure, index) => ({ id: `enterprise:${index}:${measure.measureName}`, name: measure.measureName, expression: measure.dax, table: measure.table }));
    const daxValidation = validatedModel ? validateDaxMeasures([...modelInputs, ...enterpriseInputs], validatedModel.tables) : [];
    const daxBlocking = daxValidation.some((result) => result.status !== "valid") || (validatedModel?.diagnostics.some(
      (diagnostic) =>
        diagnostic.area === "measure" &&
        (diagnostic.severity === "blocking-error" || diagnostic.severity === "error") &&
        !diagnostic.approved,
    ) ?? false);
    const unresolvedSourceMappingsCount = (enterpriseAnalysis?.sourceMappings || []).filter(
      (row) => !row.bypassQvd && row.status !== "Mapped",
    ).length;
    const result = validateStepCompletion(stepId, {
      filesCount: enterpriseFiles.length,
      hasEnterpriseAnalysis: Boolean(enterpriseAnalysis),
      hasQvwAnalysis: Boolean(qvwAnalysis),
      hasExpressionInventory: Boolean(expressionInventory),
      hasPowerBiModel: Boolean(validatedModel),
      hasReadyPowerBiModel: Boolean(validatedModel && validatedModel.blockingErrorCount === 0),
      hasPowerQueryOutput: Boolean(enterpriseAnalysis && Object.keys(enterpriseAnalysis.mQueries || {}).length > 0),
      hasSemanticValidation: Boolean(
        enterpriseAnalysis?.validation.isReadyForPbipExport &&
        validatedModel &&
        validatedModel.blockingErrorCount === 0,
      ),
      hasCurrentDaxValidation: Boolean(validatedModel),
      hasBlockingDaxErrors: daxBlocking,
      isQvsOnlyMode: enterpriseFiles.length > 0 && !enterpriseFiles.some((file) => file.extension.toLowerCase() === ".qvw"),
      unresolvedSourceMappingsCount,
      hasAppliedEtlMapping: isRequiredActionCompleted(4, isDemo),
      hasRegeneratedPowerQuery: isRequiredActionCompleted(5, isDemo),
      hasAppliedDax: isRequiredActionCompleted(6, isDemo),
    });

    return {
      canProceed: result.ok,
      reason: result.reason,
      hasErrors: !result.ok,
      statusLabel: result.ok ? "Ready to proceed" : "Action required",
    };
  }, [enterpriseAnalysis, enterpriseFiles, expressionInventory, isDemo, powerBiModel, qvwAnalysis, revision, stepId]);
}

