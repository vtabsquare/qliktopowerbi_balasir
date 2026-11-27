import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMigration } from "@/lib/migration/store";
import { useAuth } from "@/contexts/AuthContext";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader2, Lock, RefreshCw } from "lucide-react";
import { EnterpriseDaxPage } from "@/components/migration/EnterpriseDaxPage";
import { RepairFocusNotice } from "@/components/migration/RepairFocusNotice";
import { DemoEndedModal } from "@/components/migration/DemoEndedModal";
import { toast } from "sonner";
import { isRequiredActionCompleted, markStepCompleted, navigateWorkflow, setRequiredActionCompleted, unmarkStepCompleted } from "@/lib/migration/workflow-gating";
import { useNavigationLoading } from "@/components/common/NavigationLoadingOverlay";
import type { DaxValidationResult } from "@/lib/migration/dax";

export const Route = createFileRoute("/app/dax-measures")({
  component: DaxMeasuresPage,
});

export function DaxMeasuresPage() {
  const navigate = useNavigate();
  const { enterpriseAnalysis } = useMigration();
  const { isDemo } = useAuth();
  const { withLoading } = useNavigationLoading();
  const [showDemoEndedModal, setShowDemoEndedModal] = useState(false);
  const [applyingDax, setApplyingDax] = useState(false);
  const [daxApplied, setDaxApplied] = useState(() => isRequiredActionCompleted(6, isDemo));
  const [daxValidation, setDaxValidation] = useState<DaxValidationResult[] | null>(null);
  const hasBlockingDax = daxValidation === null || daxValidation.some((result) => result.status !== "valid");
  const blockingCount = daxValidation?.filter((result) => result.status !== "valid").length ?? 0;

  const handleValidationChange = useCallback((results: DaxValidationResult[]) => {
    setDaxValidation(results);
  }, []);

  useEffect(() => {
    if (daxValidation?.some((result) => result.status !== "valid")) {
      setDaxApplied(false);
      setRequiredActionCompleted(6, isDemo, false);
      unmarkStepCompleted(6, isDemo);
    }
  }, [daxValidation, isDemo]);

  const handleApplyAndRegenerateDax = async () => {
    setApplyingDax(true);
    try {
      const report = await useMigration.getState().runAutoFix();
      const stillBlocking = (report?.afterBlocking || 0) > 0 && hasBlockingDax;
      if (stillBlocking || hasBlockingDax) {
        setDaxApplied(false);
        setRequiredActionCompleted(6, isDemo, false);
        unmarkStepCompleted(6, isDemo);
        toast.error("Please complete Apply & Regenerate and resolve all blocking errors before proceeding to Power BI Model.");
        return;
      }
      setDaxApplied(true);
      setRequiredActionCompleted(6, isDemo, true);
      markStepCompleted(6, isDemo);
      toast.success("DAX Measures applied and regenerated! Step 8 (Power BI Model) is now unlocked.");
    } catch (e) {
      setDaxApplied(false);
      setRequiredActionCompleted(6, isDemo, false);
      toast.error("Failed to apply & regenerate DAX measures", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setApplyingDax(false);
    }
  };

  const handleProceedToSemanticModel = () => {
    if (!daxApplied) {
      toast.error("Please complete Apply & Regenerate and resolve all blocking errors before proceeding to Power BI Model.");
      return;
    }
    if (hasBlockingDax) {
      toast.error("Please complete Apply & Regenerate and resolve all blocking errors before proceeding to Power BI Model.", {
        description: `${blockingCount || "One or more"} measure(s) still contain a blocking error. Open the affected measure, fix it, and save to revalidate.`,
      });
      return;
    }
    markStepCompleted(6, isDemo);
    toast.success("Step 7 (DAX Measures) Completed! Step 8 (Power BI Model) is now unlocked.");
    withLoading(
      async () => {
        navigateWorkflow("/app/powerbi-model", navigate);
      },
      { message: "Loading Step 8: Power BI Model...", subMessage: "Constructing star-schema dimensional model..." },
    );
  };

  if (!enterpriseAnalysis) {
    return (
      <div className="surface-card p-8 flex flex-col items-center text-center gap-4">
        <AlertCircle className="h-10 w-10 text-warning" />
        <div>
          <h3 className="font-display text-xl font-semibold">No Analysis Data</h3>
          <p className="text-sm text-muted-foreground mt-1">Please run the Enterprise Analysis first.</p>
        </div>
        <div className="flex flex-wrap justify-center items-center gap-3">
          <button onClick={() => navigateWorkflow("/app/analysis", navigate)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium">
            <ArrowLeft className="h-4 w-4" /> Go to Analysis
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <RepairFocusNotice areas={["dax"]} />
      <EnterpriseDaxPage analysis={enterpriseAnalysis} onValidationChange={handleValidationChange} />
      {hasBlockingDax && daxValidation !== null && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm" role="alert">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div><div className="font-semibold">Continue is blocked by DAX validation</div><div className="mt-1 text-xs text-muted-foreground">Resolve and save all {blockingCount} affected measure(s). Warnings remain visible but do not block progress.</div></div>
        </div>
      )}
      <div className="surface-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {daxApplied && !hasBlockingDax
            ? "DAX measures applied, synchronized, and validated. Step 8 (Power BI Model) is unlocked."
            : "Apply & Regenerate validates all DAX expressions and synchronizes measures into the Power BI Model."}
        </div>
        <button
          type="button"
          data-tour="apply-regenerate-dax"
          onClick={handleApplyAndRegenerateDax}
          disabled={applyingDax}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:opacity-90 disabled:opacity-50 transition-all sm:ml-auto shrink-0 cursor-pointer"
        >
          {applyingDax ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : daxApplied && !hasBlockingDax ? (
            <Check className="h-4 w-4 text-emerald-300" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span>{applyingDax ? "Applying & Regenerating..." : "Apply & Regenerate"}</span>
        </button>
      </div>
      <div className="flex justify-between items-center pt-2">
        <button onClick={() => navigateWorkflow("/app/power-query", navigate)} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-surface-elevated">
          <ArrowLeft className="h-4 w-4" /> Back to Power Query
        </button>
        <button
          data-tour="semantic-model-export"
          onClick={handleProceedToSemanticModel}
          disabled={!daxApplied || hasBlockingDax}
          aria-disabled={!daxApplied || hasBlockingDax}
          title={
            !daxApplied
              ? "Please complete Apply & Regenerate and resolve all blocking errors before proceeding to Power BI Model."
              : hasBlockingDax
              ? "Resolve all blocking DAX validation errors before continuing"
              : undefined
          }
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg hover:opacity-90 transition-all disabled:cursor-not-allowed disabled:opacity-50"
        >
          Power BI Model <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Demo Ended Modal shown when Demo user clicks Semantic Model & Export */}
      <DemoEndedModal
        isOpen={showDemoEndedModal}
        onClose={() => setShowDemoEndedModal(false)}
      />
    </div>
  );
}
