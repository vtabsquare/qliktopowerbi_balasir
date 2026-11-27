import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Layers, Maximize2, Minimize2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { WORKFLOW_STEPS, isStepUnlocked, markStepCompleted } from "@/lib/migration/workflow-gating";
import { InstructionsPage } from "@/routes/app/instructions";
import { UploadPage } from "@/routes/app/index";
import { QvwAnalysisPage } from "@/routes/app/qvw-analysis";
import { ExpressionConversionPage } from "@/routes/app/expression-conversion";
import { AnalysisPage } from "@/routes/app/analysis";
import { PowerQueryPage } from "@/routes/app/power-query";
import { DaxMeasuresPage } from "@/routes/app/dax-measures";
import { SimplePowerBiModelPage } from "./SimplePowerBiModelPage";
import { SemanticModelPage } from "@/routes/app/semantic-model";
import { PipelineLogsPage } from "@/routes/app/logs";
import { useStageReadiness } from "./use-stage-readiness";

export interface StageModalOverlayProps {
  isOpen: boolean;
  stepId: number;
  isDemo?: boolean;
  onClose: () => void;
  onNavigateToStep: (stepId: number) => void;
  onViewInCanvas: (stepId: number) => void;
}

export function StageModalOverlay({
  isOpen,
  stepId,
  isDemo = false,
  onClose,
  onNavigateToStep,
  onViewInCanvas,
}: StageModalOverlayProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const currentStep = WORKFLOW_STEPS[stepId] || WORKFLOW_STEPS[0];
  const nextStep = WORKFLOW_STEPS[stepId + 1];
  const prevStep = stepId > 0 ? WORKFLOW_STEPS[stepId - 1] : null;
  const readiness = useStageReadiness(stepId);

  useEffect(() => {
    if (!isOpen || !contentScrollRef.current) return;
    contentScrollRef.current.scrollTop = 0;
  }, [isOpen, stepId]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const approveAndProceed = () => {
    if (!readiness.canProceed) {
      toast.error(`Step ${currentStep.stepNumber} cannot be approved`, { description: readiness.reason });
      return;
    }
    markStepCompleted(stepId, isDemo);
    if (!nextStep) {
      onClose();
      return;
    }
    if (!isStepUnlocked(nextStep.id, isDemo)) {
      toast.info(isDemo ? "Phase 3 is locked in the Demo Version." : "The next stage is still locked.");
      return;
    }
    onNavigateToStep(nextStep.id);
  };

  const renderStep = () => {
    switch (stepId) {
      case 0: return <InstructionsPage />;
      case 1: return <UploadPage />;
      case 2: return <QvwAnalysisPage />;
      case 3: return <ExpressionConversionPage />;
      case 4: return <AnalysisPage />;
      case 5: return <PowerQueryPage />;
      case 6: return <DaxMeasuresPage />;
      case 7: return <SimplePowerBiModelPage forcedRelationshipsPage={false} />;
      case 8: return <SimplePowerBiModelPage forcedRelationshipsPage />;
      case 9: return <SemanticModelPage />;
      case 10: return <PipelineLogsPage />;
      default: return <InstructionsPage />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`${fullscreen ? "h-full max-w-full rounded-none" : "h-[90vh] max-w-6xl rounded-2xl"} flex w-full flex-col overflow-hidden border border-border bg-surface shadow-2xl`} role="dialog" aria-modal="true" aria-labelledby="modal-step-title">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-surface-elevated/80 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Layers className="h-4 w-4" /></div>
            <div className="min-w-0">
              <div className="truncate text-[10px] font-bold uppercase tracking-wider text-primary">Step {currentStep.stepNumber} of {WORKFLOW_STEPS.length} · Phase {currentStep.phase}</div>
              <h2 id="modal-step-title" className="truncate text-base font-bold text-foreground">{currentStep.label}</h2>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => setFullscreen((value) => !value)} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={fullscreen ? "Restore modal size" : "Expand modal to fullscreen"}>{fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
            <button ref={closeButtonRef} type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close stage preview"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div ref={contentScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background/50 p-4 sm:p-6">{renderStep()}</div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/80 bg-surface/95 px-4 py-3 backdrop-blur-md sm:px-6">
          <button type="button" onClick={() => onViewInCanvas(stepId)} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted sm:px-4">Close &amp; view in canvas</button>
          <div className="flex items-center gap-2">
            {prevStep && <button type="button" onClick={() => onNavigateToStep(prevStep.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-surface-elevated"><ArrowLeft className="h-3.5 w-3.5" /><span className="hidden sm:inline">Step {prevStep.stepNumber}</span></button>}
            {nextStep ? <button type="button" onClick={approveAndProceed} disabled={!readiness.canProceed} title={!readiness.canProceed ? readiness.reason : undefined} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-md disabled:cursor-not-allowed disabled:opacity-40 sm:px-5"><span className="hidden sm:inline">Approve &amp; next: </span>Step {nextStep.stepNumber}<ArrowRight className="h-3.5 w-3.5" /></button> : <button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"><ShieldCheck className="h-4 w-4" />Finish review</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

