import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMigration } from "@/lib/migration/store";
import { toast } from "sonner";
import {
  Sparkles,
  Lock,
} from "lucide-react";
import {
  WORKFLOW_STEPS,
  isStepCompleted,
  isStepUnlocked,
  getFirstIncompleteStep,
  getCompletedSteps,
  markStepCompleted,
  WorkflowStep,
} from "@/lib/migration/workflow-gating";
import { useNavigationLoading } from "@/components/common/NavigationLoadingOverlay";
import { TourProvider } from "@/contexts/TourContext";
import { TourGuideOverlay } from "@/components/tour/TourGuideOverlay";
import { DemoEndedModal } from "@/components/migration/DemoEndedModal";
import { FloatingWorkflowNav } from "@/components/migration/FloatingWorkflowNav";
import { AppHeader } from "@/components/migration/AppHeader";
import { StageNav } from "@/components/migration/StageNav";

// Step Component Views
import { InstructionsPage } from "@/routes/app/instructions";
import { UploadPage } from "@/routes/app/index";
import { QvwAnalysisPage } from "@/routes/app/qvw-analysis";
import { ExpressionConversionPage } from "@/routes/app/expression-conversion";
import { AnalysisPage } from "@/routes/app/analysis";
import { PowerQueryPage } from "@/routes/app/power-query";
import { DaxMeasuresPage } from "@/routes/app/dax-measures";
import { SemanticModelPage } from "@/routes/app/semantic-model";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Qlik to Power BI – Demo Version" },
      { name: "description", content: "Dedicated Demo Environment for Qlik to Power BI Migration Engine." },
    ],
  }),
  component: DemoPageRoot,
});

function DemoPageRoot() {
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = "Qlik to Power BI – Demo Version";
    }
  }, []);

  return <DemoWorkspace />;
}

// ─── Dedicated Demo Workspace & Step-by-Step Navigation ───────────────────
function DemoWorkspace({ session, onLoggedOut }: { session?: any; onLoggedOut?: () => void } = {}) {
  const { withLoading } = useNavigationLoading();
  const [activeStepId, setActiveStepId] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const param = new URLSearchParams(window.location.search).get("step");
      if (param) {
        const found = WORKFLOW_STEPS.findIndex((s) => s.demoStepParam === param || String(s.id) === param);
        if (found >= 0) return found;
      }
    }
    return 0;
  });
  const [completedSteps, setCompletedSteps] = useState<number[]>(() => getCompletedSteps(true));
  const { enterpriseAnalysis } = useMigration();

  // Sync completed steps and listen to active step changes
  useEffect(() => {
    const handleSync = () => {
      setCompletedSteps(getCompletedSteps(true));
    };
    const handleSetStep = (e: Event) => {
      const stepId = (e as CustomEvent)?.detail?.stepId;
      if (typeof stepId === "number") {
        setActiveStepId(stepId);
        try {
          const targetUrl = new URL(window.location.href);
          targetUrl.searchParams.set("step", WORKFLOW_STEPS[stepId]?.demoStepParam || String(stepId));
          window.history.replaceState({}, "", targetUrl.toString());
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("workflow-step-completed", handleSync);
    window.addEventListener("demo-set-active-step", handleSetStep);
    return () => {
      window.removeEventListener("workflow-step-completed", handleSync);
      window.removeEventListener("demo-set-active-step", handleSetStep);
    };
  }, []);

  // Handle step selection with strict locking validation
  const handleSelectStep = (targetStep: WorkflowStep) => {
    const unlocked = isStepUnlocked(targetStep.id, true);

    if (!unlocked) {
      if (targetStep.phase === 3) {
        window.dispatchEvent(new CustomEvent("open-demo-ended-modal"));
        toast.info(`🔒 ${targetStep.label} is locked in Demo Version. Phase 3 access requires Production.`);
        return;
      }

      const incomplete = getFirstIncompleteStep(targetStep.id, true);
      toast.error(
        `Please complete Step ${incomplete.stepNumber} (${incomplete.label}) before proceeding to Step ${targetStep.stepNumber} (${targetStep.label}).`,
        {
          action: {
            label: `Go to Step ${incomplete.stepNumber}`,
            onClick: () => {
              withLoading(
                async () => {
                  setActiveStepId(incomplete.id);
                  const targetUrl = new URL(window.location.href);
                  targetUrl.searchParams.set("step", incomplete.demoStepParam || String(incomplete.id));
                  window.history.pushState({}, "", targetUrl.toString());
                },
                { message: `Loading Step ${incomplete.stepNumber}: ${incomplete.label}...` },
              );
            },
          },
          duration: 6000,
        },
      );
      return;
    }

    if (activeStepId === targetStep.id) return;

    withLoading(
      async () => {
        if (targetStep.id === 1) {
          window.dispatchEvent(new CustomEvent("open-upload-modal"));
        }
        setActiveStepId(targetStep.id);
        const targetUrl = new URL(window.location.href);
        targetUrl.searchParams.set("step", targetStep.demoStepParam || String(targetStep.id));
        window.history.pushState({}, "", targetUrl.toString());
      },
      { message: `Loading Step ${targetStep.stepNumber}: ${targetStep.label}...`, subMessage: "Preparing demo workspace..." },
    );
  };

  const currentStep = WORKFLOW_STEPS[activeStepId] || WORKFLOW_STEPS[0];
  const tableCount = enterpriseAnalysis?.finalTables.length ?? 0;

  return (
    <TourProvider>
      <div className="min-h-screen bg-background" id="vtab-demo-app" data-testid="vtab-demo-app">
        {/* Full Standard Header with DEMO VERSION badge, Start Tour button, user badge, and logout */}
        <AppHeader />

        {/* Main Content Area */}
        <main className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-12 sm:pb-16">
          {/* Demo Hero Banner (Shown on Step 0: Instructions; hidden on Step 1: Upload Qlik Files and subsequent steps) */}
          {activeStepId === 0 && (
            <section className="mb-6 glass-card p-6 sm:p-8 bg-gradient-to-br from-amber-500/10 via-surface/60 to-primary/10 border border-amber-500/30 shadow-lg rounded-2xl">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                <div>
                  <span className="chip mb-4 text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    DEMO VERSION • GUIDED WORKFLOW
                  </span>
                  <h1 className="font-display font-black text-[clamp(2.25rem,5vw,3.75rem)] tracking-tight leading-[1.05] mb-3 break-words">
                    <span className="text-foreground">Qlik</span>
                    <span className="mx-2 text-muted-foreground font-light">→</span>
                    <span className="gradient-text">Power BI</span>
                  </h1>
                  <p className="text-muted-foreground text-sm max-w-xl leading-relaxed">
                    Interactive Live Demo Environment. Complete each migration stage sequentially to unlock the next phase, from QlikView visualization extraction to Power Query M and DAX synthesis.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto">
                  <Metric icon="◎" value="100%" label="Conversion accuracy" />
                  <Metric icon="⚡" value="10x" label="Faster than manual" />
                  <Metric icon="❒" value={tableCount ? `${tableCount}` : "137"} label={tableCount ? "Final tables" : "Demo files"} />
                </div>
              </div>
            </section>
          )}

          {/* Unified Enterprise 11-Stage Navigation */}
          <StageNav
            activeStepId={activeStepId}
            onStepSelect={(targetStage) => handleSelectStep(WORKFLOW_STEPS[targetStage.id])}
          />

          {/* Active Step Content Container (Without redundant nested surface card) */}
          <div className="w-full">
            {activeStepId === 0 && <InstructionsPage />}
            {activeStepId === 1 && <UploadPage />}
            {activeStepId === 2 && <QvwAnalysisPage />}
            {activeStepId === 3 && <ExpressionConversionPage />}
            {activeStepId === 4 && <AnalysisPage />}
            {activeStepId === 5 && <PowerQueryPage />}
            {activeStepId === 6 && <DaxMeasuresPage />}
            {activeStepId === 7 && <SemanticModelPage />}
            {activeStepId >= 8 && <SemanticModelPage />}
          </div>
        </main>

        <FloatingWorkflowNav />
        <DemoEndedModal />
        <TourGuideOverlay />
      </div>
    </TourProvider>
  );
}

function Metric({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="surface-card p-3.5 flex items-center gap-3 bg-surface/80 border border-border/60 shadow-sm hover:border-primary/30 transition-all rounded-xl">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary text-base font-bold">{icon}</div>
      <div className="leading-tight">
        <div className="font-display font-bold text-lg text-foreground">{value}</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
