import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useMigration } from "@/lib/migration/store";
import { toast } from "sonner";
import {
  WORKFLOW_STEPS,
  getLockedStepActionMessage,
  isStepUnlocked,
  getFirstIncompleteStep,
  getCompletedSteps,
  markStepCompleted,
  consumePendingReloadRedirect,
  scrollWorkflowToTop,
  WorkflowStep,
} from "@/lib/migration/workflow-gating";
import { useNavigationLoading } from "@/components/common/NavigationLoadingOverlay";
import { TourProvider } from "@/contexts/TourContext";
import { TourGuideOverlay } from "@/components/tour/TourGuideOverlay";
import { DemoEndedModal } from "@/components/migration/DemoEndedModal";
import { FloatingWorkflowNav } from "@/components/migration/FloatingWorkflowNav";
import { AppHeader } from "@/components/migration/AppHeader";
import { StageNav } from "@/components/migration/StageNav";
import { StageModalOverlay } from "@/components/migration/StageModalOverlay";
import { StageValidationBanner } from "@/components/migration/StageValidationBanner";
import { useStageReadiness } from "@/components/migration/use-stage-readiness";

// Step Component Views
import { InstructionsPage } from "@/routes/app/instructions";
import { UploadPage } from "@/routes/app/index";
import { QvwAnalysisPage } from "@/routes/app/qvw-analysis";
import { ExpressionConversionPage } from "@/routes/app/expression-conversion";
import { AnalysisPage } from "@/routes/app/analysis";
import { PowerQueryPage } from "@/routes/app/power-query";
import { DaxMeasuresPage } from "@/routes/app/dax-measures";
import { SemanticModelPage } from "@/routes/app/semantic-model";
import { SimplePowerBiModelPage } from "@/components/migration/SimplePowerBiModelPage";

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
function DemoWorkspace({ session, onLoggedOut }: { session?: unknown; onLoggedOut?: () => void } = {}) {
  const { withLoading } = useNavigationLoading();
  const [activeStepId, setActiveStepId] = useState<number>(0);
  const [, setCompletedSteps] = useState<number[]>([0]);
  const [modalStepId, setModalStepId] = useState<number | null>(null);
  const { enterpriseAnalysis } = useMigration();

  // Sync URL ?step=, browser Back/Forward (popstate), and completed steps after hydration
  useEffect(() => {
    if (consumePendingReloadRedirect()) {
      useMigration.getState().reset();
      setCompletedSteps([]);
      setActiveStepId(0);
      try {
        const targetUrl = new URL(window.location.href);
        targetUrl.searchParams.set("step", "instructions");
        window.history.replaceState({}, "", targetUrl.toString());
      } catch {
        // ignore
      }
    } else {
      setCompletedSteps(getCompletedSteps(true));
    }
    const syncStepFromUrl = () => {
      const param = new URLSearchParams(window.location.search).get("step");
      if (!param) {
        setActiveStepId(0);
        return;
      }
      const found = WORKFLOW_STEPS.findIndex((s) => s.demoStepParam === param || String(s.id) === param);
      if (found < 0) return;
      if (isStepUnlocked(found, true)) {
        setActiveStepId(found);
      } else {
        const fallback = found >= 10 ? WORKFLOW_STEPS[9] : getFirstIncompleteStep(found, true);
        const safeStep = isStepUnlocked(fallback.id, true) ? fallback : WORKFLOW_STEPS[0];
        setActiveStepId(safeStep.id);
        try {
          const targetUrl = new URL(window.location.href);
          targetUrl.searchParams.set("step", safeStep.demoStepParam || String(safeStep.id));
          window.history.replaceState({}, "", targetUrl.toString());
        } catch {
          // ignore
        }
      }
    };

    syncStepFromUrl();
    const handleSync = () => {
      setCompletedSteps(getCompletedSteps(true));
    };
    const handleSetStep = (e: Event) => {
      const stepId = (e as CustomEvent)?.detail?.stepId;
      if (typeof stepId === "number" && isStepUnlocked(stepId, true)) {
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
    window.addEventListener("popstate", syncStepFromUrl);
    return () => {
      window.removeEventListener("workflow-step-completed", handleSync);
      window.removeEventListener("demo-set-active-step", handleSetStep);
      window.removeEventListener("popstate", syncStepFromUrl);
    };
  }, []);

  // Handle step selection with strict locking validation
  const handleSelectStep = (targetStep: WorkflowStep) => {
    const unlocked = isStepUnlocked(targetStep.id, true);

    if (!unlocked) {
      if (targetStep.id >= 10) {
        toast.info(`🔒 ${targetStep.label} is locked in Demo Version. Phase 3 access requires Production.`);
        return;
      }

      const incomplete = getFirstIncompleteStep(targetStep.id, true);
      toast.error(getLockedStepActionMessage(incomplete.id), {
        description: `Step ${incomplete.stepNumber} (${incomplete.label}) must be completed before accessing Step ${targetStep.stepNumber} (${targetStep.label}).`,
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
  const readiness = useStageReadiness(activeStepId);
  const mainScrollRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const resetScroll = () => {
      if (mainScrollRef.current) {
        mainScrollRef.current.scrollTop = 0;
        mainScrollRef.current.scrollTo?.({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      }
      scrollWorkflowToTop();
    };
    resetScroll();
    const rafId = typeof window !== "undefined" ? window.requestAnimationFrame(resetScroll) : 0;
    const timerId = typeof window !== "undefined" ? window.setTimeout(resetScroll, 80) : 0;
    return () => {
      if (rafId && typeof window !== "undefined") window.cancelAnimationFrame(rafId);
      if (timerId && typeof window !== "undefined") window.clearTimeout(timerId);
    };
  }, [activeStepId]);

  const openNextStage = () => {
    if (!readiness.canProceed) {
      toast.error(`Step ${currentStep.stepNumber} is not ready`, { description: readiness.reason });
      return;
    }
    markStepCompleted(activeStepId, true);
    const next = WORKFLOW_STEPS[activeStepId + 1];
    if (!next) return;
    if (!isStepUnlocked(next.id, true)) {
      toast.info(`🔒 ${next.label} is locked in Demo Version. Phase 3 access requires Production.`);
      return;
    }
    setModalStepId(next.id);
  };

  return (
    <TourProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background" id="vtab-demo-app" data-testid="vtab-demo-app">
        {/* Full Standard Header with DEMO VERSION badge, Start Tour button, user badge, and logout */}
        <div className="z-30 shrink-0"><AppHeader /></div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row overflow-hidden">
          <StageNav viewportDocked activeStepId={activeStepId} onStepSelect={(targetStage) => handleSelectStep(WORKFLOW_STEPS[targetStage.id])} />

          {/* Main Content Area */}
          <main
            ref={mainScrollRef}
            data-workflow-main-scroll="true"
            className="min-w-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-16 sm:px-5 sm:py-4 sm:pb-16"
          >
            <div className="w-full max-w-full space-y-3">
              {/* Demo Hero Banner (Shown on Step 0: Instructions; hidden on Step 1: Upload Qlik Files and subsequent steps) */}
              {activeStepId === 0 && (
                <section className="w-full h-auto mb-3 p-3.5 sm:p-4 lg:p-5 glass-card bg-gradient-to-br from-amber-500/10 via-surface/60 to-primary/10 border border-amber-500/30 shadow-md rounded-2xl">
                  <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 sm:gap-4">
                    <div className="min-w-0">
                      <span className="chip mb-1.5 text-[10px] py-0.5 px-2 text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        DEMO VERSION • GUIDED WORKFLOW
                      </span>
                      <h1 className="font-display font-black text-[clamp(1.375rem,2.6vw,2rem)] tracking-tight leading-[1.08] mb-1 break-words">
                        <span className="text-foreground">Qlik</span>
                        <span className="mx-1.5 text-muted-foreground font-light">→</span>
                        <span className="gradient-text">Power BI</span>
                      </h1>
                      <p className="text-muted-foreground text-xs sm:text-[13px] max-w-2xl leading-snug">
                        Interactive Live Demo Environment. Complete each migration stage sequentially to unlock the next phase, from QlikView visualization extraction to Power Query M and DAX synthesis.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full xl:w-auto shrink-0">
                      <Metric icon="◎" value="100%" label="Conversion accuracy" />
                      <Metric icon="⚡" value="10x" label="Faster than manual" />
                      <Metric icon="❒" value={tableCount ? `${tableCount}` : "137"} label={tableCount ? "Final tables" : "Demo files"} />
                    </div>
                  </div>
                </section>
              )}

              <StageValidationBanner
                stepId={activeStepId}
                canProceed={readiness.canProceed}
                blockedReason={readiness.reason}
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
                {activeStepId === 7 && <SimplePowerBiModelPage />}
                {activeStepId === 8 && <SimplePowerBiModelPage forcedRelationshipsPage />}
                {activeStepId >= 9 && <SemanticModelPage />}
              </div>
            </div>
          </main>
        </div>

        <StageModalOverlay isOpen={modalStepId !== null} stepId={modalStepId ?? 0} isDemo onClose={() => setModalStepId(null)} onNavigateToStep={setModalStepId} onViewInCanvas={(targetId) => { setModalStepId(null); handleSelectStep(WORKFLOW_STEPS[targetId]); }} />

        <FloatingWorkflowNav />
        <DemoEndedModal />
        <TourGuideOverlay />
      </div>
    </TourProvider>
  );
}

function Metric({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="surface-card px-3 py-2 flex items-center gap-2.5 bg-surface/80 border border-border/60 shadow-xs hover:border-primary/30 transition-all rounded-xl">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary text-xs font-bold">{icon}</div>
      <div className="leading-tight min-w-0">
        <div className="font-display font-bold text-sm sm:text-base text-foreground">{value}</div>
        <div className="text-[10px] text-muted-foreground whitespace-nowrap">{label}</div>
      </div>
    </div>
  );
}
