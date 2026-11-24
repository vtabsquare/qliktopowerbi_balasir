import { CheckCircle2, Circle, AlertCircle, Loader2, Lock, ArrowRight, Sparkles } from "lucide-react";
import { usePowerQueryWorkflow } from "@/lib/migration/power-query-workflow-state";
import { cn } from "@/lib/utils";

export function PowerQueryWorkflowStepper({ isDemo }: { isDemo: boolean }) {
  const { state, isStep1Completed, isStep2Unlocked, isStep2Completed, isStep3Unlocked } = usePowerQueryWorkflow(isDemo);

  const getStep1Badge = () => {
    switch (state.step1Status) {
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Completed
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">
            <AlertCircle className="h-3.5 w-3.5" /> Failed (Retry)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-full">
            <Circle className="h-3.5 w-3.5" /> Ready
          </span>
        );
    }
  };

  const getStep2Badge = () => {
    if (!isStep2Unlocked) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full">
          <Lock className="h-3.5 w-3.5" /> Locked
        </span>
      );
    }
    switch (state.step2Status) {
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Regenerating...
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Completed
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">
            <AlertCircle className="h-3.5 w-3.5" /> Failed (Retry)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-full">
            <Circle className="h-3.5 w-3.5" /> Ready
          </span>
        );
    }
  };

  const getStep3Badge = () => {
    if (!isStep3Unlocked) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full">
          <Lock className="h-3.5 w-3.5" /> Locked
        </span>
      );
    }
    switch (state.step3Status) {
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Navigating...
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Completed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/15 px-2.5 py-1 rounded-full">
            <ArrowRight className="h-3.5 w-3.5" /> Ready
          </span>
        );
    }
  };

  const getGuidanceText = () => {
    if (!isStep1Completed) {
      return "Next action: Click 'Generate M Query' in the data types section below to begin.";
    }
    if (!isStep2Completed) {
      return "Next action: Click 'Apply and regenerate Power Query' in the Calendar Builder below.";
    }
    return "All Power Query steps completed! Click 'DAX Measures' at the bottom right to proceed.";
  };

  return (
    <div className="surface-card p-4 sm:p-5 border border-primary/25 bg-surface/70 rounded-2xl shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-display font-bold text-sm text-foreground tracking-wide uppercase">Sequential Power Query Workflow</h3>
        </div>
        <div className="text-xs font-medium text-muted-foreground bg-primary/5 border border-primary/15 px-3 py-1 rounded-full">
          Step-by-Step Execution Mode
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Step 1 */}
        <div className={cn(
          "p-3.5 rounded-xl border transition-all",
          state.step1Status === "completed" ? "bg-emerald-500/5 border-emerald-500/30" : "bg-surface border-border/80 shadow-xs"
        )}>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-mono font-bold text-muted-foreground uppercase">Step 1</span>
            {getStep1Badge()}
          </div>
          <div className="font-display font-semibold text-sm text-foreground">Generate M Query</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Synthesize M expressions from reviewed data types</div>
        </div>

        {/* Step 2 */}
        <div className={cn(
          "p-3.5 rounded-xl border transition-all",
          !isStep2Unlocked ? "opacity-60 bg-muted/20 border-border/40" : state.step2Status === "completed" ? "bg-emerald-500/5 border-emerald-500/30" : "bg-surface border-border/80 shadow-xs"
        )}>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-mono font-bold text-muted-foreground uppercase">Step 2</span>
            {getStep2Badge()}
          </div>
          <div className="font-display font-semibold text-sm text-foreground">Apply &amp; Regenerate Power Query</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Apply calendar overrides and re-synthesize M pipeline</div>
        </div>

        {/* Step 3 */}
        <div className={cn(
          "p-3.5 rounded-xl border transition-all",
          !isStep3Unlocked ? "opacity-60 bg-muted/20 border-border/40" : state.step3Status === "completed" ? "bg-emerald-500/5 border-emerald-500/30" : "bg-surface border-border/80 shadow-xs"
        )}>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-mono font-bold text-muted-foreground uppercase">Step 3</span>
            {getStep3Badge()}
          </div>
          <div className="font-display font-semibold text-sm text-foreground">DAX Measures</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Proceed to Step 7 (DAX Measures translation)</div>
        </div>
      </div>

      <div className="mt-3.5 pt-3 border-t border-border/50 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="font-medium text-foreground">{getGuidanceText()}</span>
        </div>
      </div>
    </div>
  );
}
