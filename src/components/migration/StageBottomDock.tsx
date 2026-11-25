import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import {
  WORKFLOW_STEPS,
  isStepCompleted,
} from "@/lib/migration/workflow-gating";
import { cn } from "@/lib/utils";

export interface StageBottomDockProps {
  currentStepId: number;
  isDemo?: boolean;
  onProceedNext: () => void;
  onGoPrevious: () => void;
  canProceed?: boolean;
  statusLabel?: string;
  blockedReason?: string;
  hasErrors?: boolean;
}

export function StageBottomDock({
  currentStepId,
  isDemo = false,
  onProceedNext,
  onGoPrevious,
  canProceed = true,
  statusLabel,
  blockedReason,
  hasErrors = false,
}: StageBottomDockProps) {
  const currentStep = WORKFLOW_STEPS[currentStepId] || WORKFLOW_STEPS[0];
  const nextStep = WORKFLOW_STEPS[currentStepId + 1];
  const prevStep = currentStepId > 0 ? WORKFLOW_STEPS[currentStepId - 1] : null;
  const isCurrentDone = isStepCompleted(currentStep.id, isDemo);
  const disabled = !canProceed || hasErrors;

  return (
    <div className="z-30 flex min-h-14 shrink-0 items-center justify-between gap-3 border-t border-border/80 bg-surface/95 px-3 py-2 shadow-[0_-8px_24px_-18px_rgba(0,0,0,0.45)] backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            hasErrors ? "bg-destructive" : "bg-emerald-500",
          )}
        />
        <div className="min-w-0">
          <div className="hidden truncate text-xs font-semibold text-foreground sm:block">
            Step {currentStep.stepNumber}: {currentStep.label}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {statusLabel || (isCurrentDone ? "Completed" : "In progress")}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {prevStep && (
          <button
            type="button"
            onClick={onGoPrevious}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-surface-elevated"
            title={`Return to Step ${prevStep.stepNumber}: ${prevStep.label}`}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Previous</span>
          </button>
        )}

        {nextStep ? (
          <button
            type="button"
            onClick={onProceedNext}
            disabled={disabled}
            aria-describedby={disabled && blockedReason ? "stage-dock-blocked-reason" : undefined}
            className="inline-flex min-h-9 max-w-[68vw] items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-md transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:px-5"
            title={disabled ? blockedReason || "Complete this stage before proceeding" : `Proceed to Step ${nextStep.stepNumber}: ${nextStep.label}`}
          >
            <span className="truncate"><span className="sm:hidden">Step {nextStep.stepNumber}</span><span className="hidden sm:inline">Proceed to Step {nextStep.stepNumber}: {nextStep.label}</span></span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </button>
        ) : (
          <div className="flex min-h-9 items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-600">
            <ShieldCheck className="h-4 w-4" /> Workflow completed
          </div>
        )}
      </div>
      {disabled && blockedReason && <span id="stage-dock-blocked-reason" className="sr-only">{blockedReason}</span>}
    </div>
  );
}

