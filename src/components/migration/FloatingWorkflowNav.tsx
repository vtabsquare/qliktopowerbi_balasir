import { useState } from "react";
import { Check, X, Layers, Sparkles, Lock, Compass } from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { STAGES } from "./StageNav";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  WORKFLOW_STEPS,
  isStepCompleted,
  isStepUnlocked,
  getFirstIncompleteStep,
} from "@/lib/migration/workflow-gating";
import { useNavigationLoading } from "@/components/common/NavigationLoadingOverlay";

export function FloatingWorkflowNav() {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const { isDemo } = useAuth();
  const { withLoading } = useNavigationLoading();

  const handleNavigate = (stage: (typeof STAGES)[number]) => {
    const unlocked = isStepUnlocked(stage.id, isDemo);

    if (!unlocked) {
      if (isDemo && stage.phase === 3) {
        setOpen(false);
        window.dispatchEvent(new CustomEvent("open-demo-ended-modal"));
        toast.info(`🔒 ${stage.label} is locked in Demo Version. Contact for Phase 3 access.`);
        return;
      }

      const incomplete = getFirstIncompleteStep(stage.id, isDemo);
      toast.error(
        `Please complete Step ${incomplete.stepNumber} (${incomplete.label}) before proceeding to Step ${stage.stepNumber} (${stage.label}).`,
        {
          action: {
            label: `Go to Step ${incomplete.stepNumber}`,
            onClick: () => {
              setOpen(false);
              if (path.startsWith("/demo")) {
                window.dispatchEvent(new CustomEvent("demo-set-active-step", { detail: { stepId: incomplete.id } }));
                return;
              }
              withLoading(async () => {
                navigate({ to: incomplete.path });
              }, { message: `Loading Step ${incomplete.stepNumber}: ${incomplete.label}...` });
            },
          },
          duration: 6000,
        },
      );
      return;
    }

    setOpen(false);

    if (path.startsWith("/demo")) {
      withLoading(
        async () => {
          if (stage.id === 1) {
            window.dispatchEvent(new CustomEvent("open-upload-modal"));
          }
          window.dispatchEvent(new CustomEvent("demo-set-active-step", { detail: { stepId: stage.id } }));
          const targetUrl = new URL(window.location.href);
          targetUrl.searchParams.set("step", WORKFLOW_STEPS[stage.id]?.demoStepParam || String(stage.id));
          window.history.pushState({}, "", targetUrl.toString());
        },
        { message: `Loading ${stage.label}...`, subMessage: "Preparing demo stage workspace..." },
      );
      return;
    }

    if (path === stage.path || (path === "/app/" && stage.path === "/app")) return;

    withLoading(
      async () => {
        if (stage.path === "/app") {
          window.dispatchEvent(new CustomEvent("open-upload-modal"));
        }
        await navigate({ to: stage.path });
      },
      { message: `Loading ${stage.label}...`, subMessage: "Preparing stage workspace..." },
    );
  };

  return (
    <>
      <div className="floating-quick-jump fixed bottom-20 right-4 z-40 md:hidden transition-all duration-200">
        <button
          onClick={() => setOpen((value) => !value)}
          className="h-10 sm:h-11 px-4 sm:px-5 rounded-full bg-gradient-to-r from-primary to-[oklch(0.62_0.2_260)] text-primary-foreground shadow-elevated flex items-center gap-2 text-xs font-bold hover:scale-105 active:scale-95 transition-all cursor-pointer"
          title={open ? "Close migration menu" : "Go to migration menu"}
        >
          {open ? <X className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
          <span>{open ? "Close" : "Quick Jump"}</span>
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setOpen(false)}
        >
          <aside
            className="absolute right-4 bottom-20 w-[min(360px,calc(100vw-2rem))] max-h-[75vh] overflow-auto glass-card bg-surface/95 shadow-2xl p-5 border border-border/80 animate-in slide-in-from-bottom-4 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-3">
              <div>
                <div className="font-display font-bold text-base text-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>Migration Navigator</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Step-by-step pipeline access</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="h-7 w-7 rounded-lg hover:bg-muted grid place-items-center text-muted-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              {STAGES.map((stage) => {
                const unlocked = isStepUnlocked(stage.id, isDemo);
                const isCompleted = isStepCompleted(stage.id, isDemo);
                const active = path === stage.path || (path === "/app/" && stage.path === "/app");

                if (unlocked) {
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => handleNavigate(stage)}
                      className={`w-full text-left flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm scale-[1.01]"
                          : isCompleted
                          ? "hover:bg-muted/80 text-foreground bg-surface/60 border border-border/50"
                          : "hover:bg-muted/80 text-foreground"
                      }`}
                    >
                      <span
                        className={`grid h-6 w-6 place-items-center rounded-lg text-[10px] font-bold ${
                          active
                            ? "bg-white/20 text-white"
                            : isCompleted
                            ? "bg-success/20 text-success border border-success/30"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isCompleted ? <Check className="h-3.5 w-3.5" /> : stage.stepNumber}
                      </span>
                      <span className="truncate">{stage.label}</span>
                      {active && (
                        <span className="ml-auto text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-bold">
                          Active
                        </span>
                      )}
                    </button>
                  );
                }

                return (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => handleNavigate(stage)}
                    className="w-full text-left flex items-center gap-3 rounded-xl px-3 py-2 text-xs text-muted-foreground opacity-60 hover:opacity-100 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-500/10 text-amber-600 text-[10px] font-bold">
                      <Lock className="h-3 w-3" />
                    </span>
                    <span className="truncate">{stage.label}</span>
                    <span className="ml-auto text-[10px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded flex items-center gap-1 font-bold">
                      <span>locked</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {isDemo && (
              <div className="pt-3 mt-3 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    window.dispatchEvent(new CustomEvent("start-interactive-tour"));
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 text-xs font-semibold transition-all cursor-pointer"
                >
                  <Compass className="h-3.5 w-3.5" />
                  <span>Start Interactive Tour (14 Steps)</span>
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
