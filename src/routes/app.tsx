import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { AppHeader } from "@/components/migration/AppHeader";
import { StageNav } from "@/components/migration/StageNav";
import { useMigration } from "@/lib/migration/store";
import { Outlet } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { FloatingWorkflowNav } from "@/components/migration/FloatingWorkflowNav";
import { DemoEndedModal } from "@/components/migration/DemoEndedModal";
import { TourProvider } from "@/contexts/TourContext";
import { TourGuideOverlay } from "@/components/tour/TourGuideOverlay";
import { toast } from "sonner";
import { isPathLockedInDemo, DEMO_LOCKED_MESSAGE } from "@/lib/demo-mode";
import { cn } from "@/lib/utils";
import {
  getStepByPath,
  isStepUnlocked,
  getFirstIncompleteStep,
  markStepCompleted,
  WORKFLOW_STEPS,
} from "@/lib/migration/workflow-gating";
import { StageModalOverlay } from "@/components/migration/StageModalOverlay";
import { StageValidationBanner } from "@/components/migration/StageValidationBanner";
import { useStageReadiness } from "@/components/migration/use-stage-readiness";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Qlik to Power BI" },
      { name: "description", content: "AI-assisted Qlik to Power BI migration." },
    ],
  }),
  component: AuthGuard,
});

function AuthGuard() {
  const { session, loading, isDemo } = useAuth();
  const navigate = useNavigate();
  const router = useRouterState();
  const currentPath = router.location.pathname;

  useEffect(() => {
    if (!loading && !session) {
      const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const isEmbedOrDemo = searchParams?.get("embed") === "true" || searchParams?.get("demo") === "true" || searchParams?.get("demo") === "1";
      if (isEmbedOrDemo) {
        window.location.href = "/demo";
        return;
      }
      navigate({ to: "/auth" });
      return;
    }

    if (!loading && session) {
      // When application opens fresh, ensure it always starts on Stage 1 (Instructions)
      const hasStartedSession = sessionStorage.getItem("app_pipeline_started");
      if (!hasStartedSession) {
        sessionStorage.setItem("app_pipeline_started", "true");
        if (currentPath === "/app" || currentPath === "/app/") {
          navigate({ to: "/app/instructions" });
          return;
        }
      }

      // Dedicated environment isolation:
      // Demo users accessing /app/* are redirected to their dedicated /demo route
      if (isDemo && currentPath.startsWith("/app")) {
        const step = getStepByPath(currentPath);
        const stepParam = step?.demoStepParam || "instructions";
        window.location.href = `/demo?step=${encodeURIComponent(stepParam)}`;
        return;
      }

      if (isDemo && isPathLockedInDemo(currentPath)) {
        window.dispatchEvent(new CustomEvent("open-demo-ended-modal"));
        toast.info(DEMO_LOCKED_MESSAGE);
        navigate({ to: "/app/dax-measures" });
        return;
      }

      // Step-by-Step sequential workflow route protection:
      // Prevent users from bypassing locked steps via direct browser URL entry
      const currentStep = getStepByPath(currentPath);
      if (currentStep && currentStep.id > 0) {
        const unlocked = isStepUnlocked(currentStep.id, isDemo);
        if (!unlocked) {
          const incomplete = getFirstIncompleteStep(currentStep.id, isDemo);
          toast.error(
            `Access Restricted: Please complete Step ${incomplete.stepNumber} (${incomplete.label}) before proceeding to Step ${currentStep.stepNumber} (${currentStep.label}).`,
            {
              action: {
                label: `Go to Step ${incomplete.stepNumber}`,
                onClick: () => navigate({ to: incomplete.path }),
              },
              duration: 6000,
            },
          );
          navigate({ to: incomplete.path });
          return;
        }
      }
    }
  }, [session, loading, isDemo, currentPath, navigate]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="h-4 w-4 rounded-full bg-primary animate-pulse" />
      </div>
    );
  }

  return <MigrationLayout />;
}

function MigrationLayout() {
  const { isDemo } = useAuth();
  const { enterpriseAnalysis } = useMigration();
  const router = useRouterState();
  const navigate = useNavigate();
  const currentPath = router.location.pathname;
  const isInstructions = currentPath === "/app/instructions";
  const isUploadStep = currentPath === "/app" || currentPath === "/app/";
  const tableCount = enterpriseAnalysis?.finalTables.length ?? 0;
  const matchedStep = getStepByPath(currentPath);
  const currentStep = matchedStep || WORKFLOW_STEPS[0];
  const readiness = useStageReadiness(currentStep.id);
  const [modalStepId, setModalStepId] = useState<number | null>(null);

  const openNextStage = () => {
    if (!readiness.canProceed) {
      toast.error(`Step ${currentStep.stepNumber} is not ready`, { description: readiness.reason });
      return;
    }
    markStepCompleted(currentStep.id, isDemo);
    const nextStep = WORKFLOW_STEPS[currentStep.id + 1];
    if (!nextStep) return;
    if (!isStepUnlocked(nextStep.id, isDemo)) {
      if (isDemo && nextStep.phase === 3) window.dispatchEvent(new CustomEvent("open-demo-ended-modal"));
      toast.info(isDemo ? "Phase 3 is locked in the Demo Version." : "The next stage is still locked.");
      return;
    }
    setModalStepId(nextStep.id);
  };

  const navigateToCanvas = (stepId: number) => {
    const target = WORKFLOW_STEPS[stepId];
    if (!target) return;
    setModalStepId(null);
    navigate({ to: target.path });
  };

  return (
    <TourProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background" id="vtab-demo-app" data-testid="vtab-demo-app">
        <div className="z-30 shrink-0"><AppHeader /></div>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row overflow-hidden">
          {matchedStep && <StageNav viewportDocked />}

          <main className="min-w-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-20 sm:px-6 sm:py-5 sm:pb-20">
            <div className="w-full space-y-4">
              {isInstructions ? (
                <Hero tableCount={tableCount} />
              ) : !isUploadStep && matchedStep ? (
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface/60 px-4 py-2 text-xs shadow-xs">
                  <div className="flex items-center gap-2 font-medium text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                    <span>Workspace Active</span><span>•</span>
                    <span className="font-semibold text-foreground">{tableCount ? `${tableCount} Final Tables` : "Pipeline Ready"}</span>
                  </div>
                </div>
              ) : null}
              {matchedStep && (
                <StageValidationBanner
                  stepId={currentStep.id}
                  canProceed={readiness.canProceed}
                  blockedReason={readiness.reason}
                />
              )}
              <Outlet />
            </div>
          </main>
        </div>

        <StageModalOverlay isOpen={modalStepId !== null} stepId={modalStepId ?? 0} isDemo={isDemo} onClose={() => setModalStepId(null)} onNavigateToStep={setModalStepId} onViewInCanvas={navigateToCanvas} />
        <FloatingWorkflowNav />
        {isDemo && <DemoEndedModal />}
        {isDemo && <TourGuideOverlay />}
      </div>
    </TourProvider>
  );
}

function Hero({ tableCount, compact = false }: { tableCount: number; compact?: boolean }) {
  return (
    <section
      className={cn(
        "glass-card rounded-2xl bg-gradient-to-br from-primary/10 via-surface/60 to-primary/5 border border-primary/20 shadow-lg transition-all duration-300 ease-in-out",
        compact ? "mb-4 p-4 sm:p-5" : "mb-6 p-6 sm:p-8"
      )}
    >
      <div
        className={cn(
          "flex flex-col lg:flex-row lg:items-center lg:justify-between transition-all duration-300",
          compact ? "gap-4" : "gap-6"
        )}
      >
        <div>
          <span
            className={cn(
              "chip text-primary bg-primary/10 border-primary/20 transition-all duration-300",
              compact ? "mb-2 text-[10px] py-0.5 px-2" : "mb-4"
            )}
          >
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            AI MIGRATION ENGINE ACTIVE
          </span>
          <h1
            className={cn(
              "font-display font-black tracking-tight leading-[1.05] break-words transition-all duration-300",
              compact
                ? "text-[clamp(1.5rem,3.2vw,2.25rem)] mb-1.5"
                : "text-[clamp(2.25rem,5vw,3.75rem)] mb-3"
            )}
          >
            <span className="text-foreground">Qlik</span>
            <span className="mx-2 text-muted-foreground font-light">→</span>
            <span className="gradient-text">Power BI</span>
          </h1>
          <p
            className={cn(
              "text-muted-foreground leading-relaxed transition-all duration-300",
              compact ? "text-xs max-w-xl" : "text-sm max-w-xl"
            )}
          >
            Enterprise-grade automated migration. Upload your Qlik scripts, run the analysis engine, and export a deployment-ready Power BI PBIP project with star-schema modeling and DAX translation.
          </p>
        </div>
        <div
          className={cn(
            "grid grid-cols-1 sm:grid-cols-3 w-full lg:w-auto transition-all duration-300 shrink-0",
            compact ? "gap-2" : "gap-3"
          )}
        >
          <Metric icon="◎" value="100%" label="Conversion accuracy" compact={compact} />
          <Metric icon="⚡" value="10x" label="Faster than manual" compact={compact} />
          <Metric icon="❒" value={tableCount ? `${tableCount}` : "5"} label={tableCount ? "Final tables" : "Core stages"} compact={compact} />
        </div>
      </div>
    </section>
  );
}

function Metric({
  icon,
  value,
  label,
  compact = false,
}: {
  icon: string;
  value: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "surface-card flex items-center bg-surface/80 border border-border/60 shadow-sm hover:border-primary/30 transition-all duration-300",
        compact ? "p-2.5 sm:p-3 gap-2.5" : "p-3.5 gap-3"
      )}
    >
      <div
        className={cn(
          "grid place-items-center rounded-xl bg-primary/10 text-primary font-bold transition-all duration-300 shrink-0",
          compact ? "h-8 w-8 text-sm" : "h-9 w-9 text-base"
        )}
      >
        {icon}
      </div>
      <div className="leading-tight">
        <div
          className={cn(
            "font-display font-bold text-foreground transition-all duration-300",
            compact ? "text-base" : "text-lg"
          )}
        >
          {value}
        </div>
        <div className="text-[10px] text-muted-foreground whitespace-nowrap">{label}</div>
      </div>
    </div>
  );
}

