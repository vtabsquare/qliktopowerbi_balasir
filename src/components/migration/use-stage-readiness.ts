import { useMemo } from "react";
import { useMigration } from "@/lib/migration/store";
import { validatePowerBiModel } from "@/lib/migration/model";
import { validateDaxMeasures } from "@/lib/migration/dax";
import { validateStepCompletion } from "@/lib/migration/workflow-gating";

export function useStageReadiness(stepId: number) {
  const {
    enterpriseFiles,
    enterpriseAnalysis,
    qvwAnalysis,
    expressionInventory,
    powerBiModel,
  } = useMigration();

  return useMemo(() => {
    const validatedModel = powerBiModel ? validatePowerBiModel(powerBiModel) : null;
    const modelDaxBlocking = validatedModel?.diagnostics.some(
      (diagnostic) =>
        diagnostic.area === "measure" &&
        (diagnostic.severity === "blocking-error" || diagnostic.severity === "error") &&
        !diagnostic.approved,
    ) ?? false;

    const enterpriseDaxBlocking =
      stepId === 6 && enterpriseAnalysis
        ? validateDaxMeasures(
            (enterpriseAnalysis.daxMeasures || []).map((measure, idx) => ({
              id: `enterprise:${idx}:${measure.table}:${measure.measureName}`,
              name: measure.measureName,
              expression: measure.dax,
              table: measure.table,
            })),
            powerBiModel?.tables ?? [],
          ).some((result) => result.status !== "valid")
        : false;

    const daxBlocking = modelDaxBlocking || enterpriseDaxBlocking;
    const hasCurrentDaxValidation = Boolean(validatedModel || enterpriseAnalysis);

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
      hasCurrentDaxValidation,
      hasBlockingDaxErrors: daxBlocking,
      isQvsOnlyMode: enterpriseFiles.length > 0 && !enterpriseFiles.some((file) => file.extension.toLowerCase() === ".qvw"),
    });

    return {
      canProceed: result.ok,
      reason: result.reason,
      hasErrors: !result.ok,
      statusLabel: result.ok ? "Ready to proceed" : "Action required",
    };
  }, [enterpriseAnalysis, enterpriseFiles, expressionInventory, powerBiModel, qvwAnalysis, stepId]);
}

