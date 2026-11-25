import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMigration } from "@/lib/migration/store";
import { useAuth } from "@/contexts/AuthContext";
import { AlertCircle, ArrowLeft, ArrowRight, Lock, RotateCcw } from "lucide-react";
import { EnterpriseExportPage } from "@/components/migration/EnterpriseExportPage";
import { RepairFocusNotice } from "@/components/migration/RepairFocusNotice";
import { markStepCompleted, navigateWorkflow } from "@/lib/migration/workflow-gating";
import { useNavigationLoading } from "@/components/common/NavigationLoadingOverlay";
import { toast } from "sonner";

export const Route = createFileRoute("/app/semantic-model")({
  component: SemanticModelPage,
});

export function SemanticModelPage() {
  const navigate = useNavigate();
  const { enterpriseAnalysis } = useMigration();
  const { isDemo } = useAuth();
  const { withLoading } = useNavigationLoading();

  if (!enterpriseAnalysis) {
    return (
      <div className="surface-card p-8 flex flex-col items-center text-center gap-4">
        <AlertCircle className="h-10 w-10 text-warning" />
        <div>
          <h3 className="font-display text-xl font-semibold">No Analysis Data</h3>
          <p className="text-sm text-muted-foreground mt-1">Please run the Enterprise Analysis first.</p>
        </div>
        <button onClick={() => navigate({ to: "/app/analysis" })} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
          <ArrowLeft className="h-4 w-4" /> Go to Analysis
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-tour="semantic-model-stage">
      {/* Contextual Guidance */}
      <div className="surface-card p-5 sm:p-6 border-l-4 border-l-primary bg-primary/5 shadow-sm">
        <h2 className="font-display text-xl font-bold text-foreground">Phase 3: Semantic Model &amp; Export</h2>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-3xl">
          Review the final Power BI semantic model, star-schema diagram, inferred relationships, pre-flight validation status, and deployment artifacts.
        </p>
      </div>

      <RepairFocusNotice areas={["validation"]} />
      <EnterpriseExportPage analysis={enterpriseAnalysis} />

      {/* Navigation */}
      <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
        <button
          onClick={() => {
            withLoading(
              async () => {
                navigateWorkflow("/app/powerbi-model", navigate);
              },
              { message: "Returning to Step 8: Power BI Model..." },
            );
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-surface-elevated transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Power BI Model
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              navigateWorkflow("/app/instructions", navigate);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" /> Restart Pipeline
          </button>

          {isDemo ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("open-demo-ended-modal"))}
              title="Pipeline Logs is locked in Demo Version — Contact for Full Access"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-primary/25 bg-primary/5 text-primary/80 text-sm font-semibold opacity-80 hover:opacity-100 hover:border-primary/40 transition-all cursor-pointer"
            >
              <Lock className="h-4 w-4" /> Pipeline Logs Locked
            </button>
          ) : (
            <button
              onClick={() => {
                markStepCompleted(9, isDemo);
                toast.success("Step 10 (Validation & Export) Completed! Step 11 (Pipeline Logs) is now unlocked.");
                withLoading(
                  async () => {
                    navigateWorkflow("/app/logs", navigate);
                  },
                  { message: "Loading Step 11: Pipeline Logs...", subMessage: "Retrieving audit logs and timing metrics..." },
                );
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow hover:opacity-90 transition-opacity cursor-pointer"
            >
              View Pipeline Logs <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
