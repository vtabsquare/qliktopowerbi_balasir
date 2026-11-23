import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMigration } from "@/lib/migration/store";
import { useAuth } from "@/contexts/AuthContext";
import { AlertCircle, ArrowLeft, ArrowRight, Lock } from "lucide-react";
import { EnterpriseDaxPage } from "@/components/migration/EnterpriseDaxPage";
import { RepairFocusNotice } from "@/components/migration/RepairFocusNotice";
import { DemoEndedModal } from "@/components/migration/DemoEndedModal";
import { toast } from "sonner";
import { markStepCompleted } from "@/lib/migration/workflow-gating";
import { useNavigationLoading } from "@/components/common/NavigationLoadingOverlay";

export const Route = createFileRoute("/app/dax-measures")({
  component: DaxMeasuresPage,
});

export function DaxMeasuresPage() {
  const navigate = useNavigate();
  const { enterpriseAnalysis } = useMigration();
  const { isDemo } = useAuth();
  const { withLoading } = useNavigationLoading();
  const [showDemoEndedModal, setShowDemoEndedModal] = useState(false);

  const handleProceedToSemanticModel = () => {
    markStepCompleted(6, isDemo);
    if (isDemo) {
      window.dispatchEvent(new CustomEvent("open-demo-ended-modal"));
      setShowDemoEndedModal(true);
      return;
    }
    toast.success("Step 7 (DAX Measures) Completed! Step 8 (Power BI Model) is now unlocked.");
    withLoading(
      async () => {
        navigate({ to: "/app/powerbi-model" });
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
          <button onClick={() => navigate({ to: "/app/analysis" })} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium">
            <ArrowLeft className="h-4 w-4" /> Go to Analysis
          </button>
          <button
            data-tour="semantic-model-export"
            onClick={handleProceedToSemanticModel}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow"
          >
            Semantic Model &amp; Export <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <RepairFocusNotice areas={["dax"]} />
      <EnterpriseDaxPage analysis={enterpriseAnalysis} />
      <div className="flex justify-between items-center pt-2">
        <button onClick={() => navigate({ to: "/app/power-query" })} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-surface-elevated">
          <ArrowLeft className="h-4 w-4" /> Back to Power Query
        </button>
        <button
          data-tour="semantic-model-export"
          onClick={handleProceedToSemanticModel}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg hover:opacity-90 transition-all"
        >
          Semantic Model &amp; Export <ArrowRight className="h-4 w-4" />
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
