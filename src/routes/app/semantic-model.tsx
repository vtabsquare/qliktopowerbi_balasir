import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMigration } from "@/lib/migration/store";
import { AlertCircle, ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { EnterpriseExportPage } from "@/components/migration/EnterpriseExportPage";
import { RepairFocusNotice } from "@/components/migration/RepairFocusNotice";

export const Route = createFileRoute("/app/semantic-model")({
  component: SemanticModelPage,
});

function SemanticModelPage() {
  const navigate = useNavigate();
  const { enterpriseAnalysis } = useMigration();

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
      <div className="flex justify-between items-center pt-2">
        <button
          onClick={() => navigate({ to: "/app/dax-measures" })}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" /> Back to DAX Measures
        </button>
        <button
          onClick={() => navigate({ to: "/app/instructions" })}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow hover:opacity-90 transition-opacity"
        >
          <RotateCcw className="h-4 w-4" /> Start Over / Instructions
        </button>
      </div>
    </div>
  );
}
