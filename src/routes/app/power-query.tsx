import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMigration } from "@/lib/migration/store";
import { AlertCircle, ArrowLeft, ArrowRight, Lock } from "lucide-react";
import { EnterprisePowerQueryPage } from "@/components/migration/EnterprisePowerQueryPage";
import { applyDataTypeOverrides } from "@/lib/migration/enterprise-parser";
import { RepairFocusNotice } from "@/components/migration/RepairFocusNotice";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { markStepCompleted, navigateWorkflow } from "@/lib/migration/workflow-gating";
import { useNavigationLoading } from "@/components/common/NavigationLoadingOverlay";
import { usePowerQueryWorkflow, validateCanExecuteStep } from "@/lib/migration/power-query-workflow-state";

export const Route = createFileRoute("/app/power-query")({
  component: PowerQueryPage,
});

export function PowerQueryPage() {
  const navigate = useNavigate();
  const { isDemo } = useAuth();
  const { withLoading } = useNavigationLoading();
  const { enterpriseAnalysis, enterpriseColumnTypeEdits, setEnterpriseColumnTypeEdits, setEnterpriseAnalysis } = useMigration();
  const { state: pqState, isStep1Completed, isStep2Completed, isStep3Unlocked, setStepStatus } = usePowerQueryWorkflow(isDemo);

  const handleProceedToDax = () => {
    const check = validateCanExecuteStep(isDemo, 3);
    if (!check.ok) {
      toast.error(check.message);
      return;
    }
    setStepStatus(3, "in_progress");
    markStepCompleted(5, isDemo);
    setStepStatus(3, "completed");
    toast.success("Step 6 (Power Query) Completed! Step 7 (DAX Measures) is now unlocked.");
    withLoading(
      async () => {
        navigateWorkflow("/app/dax-measures", navigate);
      },
      { message: "Loading Step 7: DAX Measures...", subMessage: "Translating expressions to DAX syntax..." },
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
          <button
            type="button"
            data-tour="generate-m-query"
            onClick={() => navigateWorkflow("/app/analysis", navigate)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium"
          >
            Generate M Query
          </button>
          <button
            type="button"
            data-tour="apply-regenerate-pq"
            onClick={() => navigateWorkflow("/app/analysis", navigate)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium"
          >
            Apply and Regenerate Power Query
          </button>
          <button
            data-tour="dax-measures"
            onClick={handleProceedToDax}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium shadow cursor-pointer hover:opacity-90"
          >
            DAX Measures <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Contextual Guidance */}
      <div className="surface-card p-5 sm:p-6 border-l-4 border-l-primary bg-primary/5 shadow-sm">
        <h2 className="font-display text-xl font-bold text-foreground">Phase 2: Power Query & M Code</h2>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-3xl">
          Review the generated M queries and optimize column data types. The Power Query scripts will handle data transformations and loading into Power BI.
        </p>
      </div>
      <RepairFocusNotice areas={["power-query", "data-types"]} />
      <EnterprisePowerQueryPage
        analysis={enterpriseAnalysis}
        columnTypeEdits={enterpriseColumnTypeEdits}
        onTypeChange={(k, v) => {
          const nextEdits = { ...enterpriseColumnTypeEdits, [k]: v };
          setEnterpriseColumnTypeEdits(nextEdits);
          setEnterpriseAnalysis(applyDataTypeOverrides(enterpriseAnalysis, nextEdits));
        }}
        onAnalysisUpdate={(a) => setEnterpriseAnalysis(a)}
      />
      <div className="flex justify-between items-center pt-2">
        <button onClick={() => navigateWorkflow("/app/analysis", navigate)} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-surface-elevated">
          <ArrowLeft className="h-4 w-4" /> Back to Analysis
        </button>
        {!isStep3Unlocked ? (
          <button
            data-tour="dax-measures"
            onClick={handleProceedToDax}
            title={
              !isStep1Completed
                ? "Please complete Generate M Query first by clicking the Generate M Query button."
                : "Please complete Apply and Regenerate Power Query first by clicking the Apply and Regenerate Power Query button."
            }
            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-border/70 bg-muted/60 text-muted-foreground font-semibold text-sm shadow-xs hover:border-amber-500/50 transition-all cursor-not-allowed"
          >
            <Lock className="h-4 w-4 text-amber-500/80" />
            <span>DAX Measures</span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground ml-1">Locked</span>
          </button>
        ) : (
          <button
            data-tour="dax-measures"
            onClick={handleProceedToDax}
            disabled={pqState.step3Status === "in_progress"}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg hover:opacity-90 transition-all cursor-pointer disabled:opacity-50"
          >
            <span>DAX Measures</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
