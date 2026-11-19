import { useEffect, useState, useRef, useCallback } from "react";
import { useTour } from "@/contexts/TourContext";
import { ArrowLeft, ArrowRight, Check, Compass, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TourStep } from "@/lib/tour/tour-config";

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function findTourElement(step: TourStep | null): HTMLElement | null {
  if (!step) return null;

  // 1. Try primary selector safely
  try {
    const el = document.querySelector(step.selector);
    if (el) return el as HTMLElement;
  } catch {
    // ignore
  }

  // 2. Try fallback selector safely
  if (step.fallbackSelector) {
    try {
      const el = document.querySelector(step.fallbackSelector);
      if (el) return el as HTMLElement;
    } catch {
      // ignore
    }
  }

  // 3. Try finding button, link, or role="button" matching step title or shortLabel
  try {
    const candidates = Array.from(document.querySelectorAll("button, a, div[role='button']"));
    const titleLower = step.title.toLowerCase();
    const labelLower = step.shortLabel.toLowerCase();

    const match = candidates.find((el) => {
      const text = el.textContent?.trim().toLowerCase() || "";
      return text.includes(titleLower) || text.includes(labelLower);
    });
    if (match) return match as HTMLElement;
  } catch {
    // ignore
  }

  return null;
}

export function TourGuideOverlay() {
  const {
    isOpen,
    currentStepIndex,
    currentStep,
    totalSteps,
    nextStep,
    prevStep,
    closeTour,
  } = useTour();

  const [targetRect, setTargetRect] = useState<HighlightRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 120, left: 24 });
  const [isElementVisible, setIsElementVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!isOpen || !currentStep) return;

    const element = findTourElement(currentStep);

    const tooltipWidth = tooltipRef.current?.offsetWidth || 380;
    const tooltipHeight = tooltipRef.current?.offsetHeight || 220;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (element) {
      const rect = element.getBoundingClientRect();
      const padding = 6;
      const highlight: HighlightRect = {
        top: Math.max(0, rect.top - padding),
        left: Math.max(0, rect.left - padding),
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      };

      setTargetRect(highlight);
      setIsElementVisible(true);

      // Tooltip position calculation
      let top = highlight.top + highlight.height + 14;
      if (top + tooltipHeight > viewportHeight - 20) {
        const spaceAbove = highlight.top - 14 - tooltipHeight;
        if (spaceAbove > 20) {
          top = spaceAbove;
        } else {
          top = Math.max(20, (viewportHeight - tooltipHeight) / 2);
        }
      }

      // Horizontal alignment: align with highlight center, clamp within viewport
      let left = highlight.left + (highlight.width - tooltipWidth) / 2;
      left = Math.max(16, Math.min(left, viewportWidth - tooltipWidth - 16));

      // Vertical clamping: ALWAYS keep tooltip visible within viewport boundaries
      top = Math.max(16, Math.min(top, viewportHeight - tooltipHeight - 16));

      setTooltipPos({ top, left });
    } else {
      setIsElementVisible(false);
      // Centered fallback when element is mounting
      const top = Math.max(40, (viewportHeight - tooltipHeight) / 2);
      const left = Math.max(16, (viewportWidth - tooltipWidth) / 2);
      setTooltipPos({ top, left });
    }
  }, [isOpen, currentStep]);

  // Scroll element into view and poll / observe for element when step changes
  useEffect(() => {
    if (!isOpen || !currentStep) return;

    let attempts = 0;
    const maxAttempts = 40; // 40 * 60ms = 2.4s

    const poll = () => {
      const element = findTourElement(currentStep);
      if (element) {
        element.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
        updatePosition();
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(poll, 60);
      } else {
        updatePosition();
      }
    };

    poll();

    // DOM MutationObserver to immediately detect dynamic mounting (e.g. routes/tabs/expression editor)
    const observer = new MutationObserver(() => {
      const element = findTourElement(currentStep);
      if (element) {
        updatePosition();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, [isOpen, currentStep, currentStepIndex, updatePosition]);

  // Handle window resize and scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowChange = () => {
      updatePosition();
    };

    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [isOpen, updatePosition]);

  const isAdvancingRef = useRef(false);

  useEffect(() => {
    isAdvancingRef.current = false;
  }, [currentStepIndex]);

  const isLastStep = currentStepIndex === totalSteps - 1;

  // Automatically advance tour when user clicks the highlighted target element
  useEffect(() => {
    if (!isOpen || !currentStep) return;

    const handleHighlightedElementClick = (e: MouseEvent) => {
      // Do not trigger if click came from inside the tour tooltip card itself
      if (tooltipRef.current && tooltipRef.current.contains(e.target as Node)) {
        return;
      }

      const element = findTourElement(currentStep);
      if (!element) return;

      const clickedInside = element === e.target || element.contains(e.target as Node);
      if (clickedInside) {
        if (isAdvancingRef.current) return;
        isAdvancingRef.current = true;
        setTimeout(() => {
          isAdvancingRef.current = false;
        }, 150);

        // Advance tour immediately in parallel without artificial delay
        if (isLastStep) {
          closeTour();
        } else {
          nextStep();
        }
      }
    };

    window.addEventListener("click", handleHighlightedElementClick, true);
    return () => {
      window.removeEventListener("click", handleHighlightedElementClick, true);
    };
  }, [isOpen, currentStep, currentStepIndex, nextStep, closeTour, isLastStep]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeTour();
      } else if (e.key === "ArrowRight" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        nextStep();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevStep();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, nextStep, prevStep, closeTour]);

  if (!isOpen || !currentStep) return null;

  const progressPercent = Math.round(((currentStepIndex + 1) / totalSteps) * 100);

  return (
    <div className="tour-guide-root fixed inset-0 z-[9990] pointer-events-none select-none">
      {/* ── 1. Spotlight Cutout Overlay (Soft Opacity, Pointer-events-none so it never intercepts clicks) ── */}
      {targetRect && isElementVisible ? (
        <div
          style={{
            position: "fixed",
            top: `${targetRect.top}px`,
            left: `${targetRect.left}px`,
            width: `${targetRect.width}px`,
            height: `${targetRect.height}px`,
            borderRadius: "16px",
            boxShadow:
              "0 0 0 9999px rgba(15, 23, 42, 0.28), 0 0 0 3px rgba(99, 102, 241, 0.35), 0 8px 24px -2px rgba(99, 102, 241, 0.3)",
            border: "2px solid oklch(0.55 0.22 265)",
            transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
            pointerEvents: "none",
            zIndex: 9991,
          }}
        >
          <div className="absolute -inset-1 rounded-[18px] ring-2 ring-primary/30 animate-pulse pointer-events-none" />
        </div>
      ) : (
        <div className="fixed inset-0 bg-slate-950/20 backdrop-blur-[1px] transition-opacity duration-200 pointer-events-none" />
      )}

      {/* ── 2. Floating Tour Tooltip Card ───────────────────────────── */}
      <div
        ref={tooltipRef}
        style={{
          position: "fixed",
          top: `${tooltipPos.top}px`,
          left: `${tooltipPos.left}px`,
          zIndex: 9995,
        }}
        className={cn(
          "w-[min(380px,calc(100vw-2rem))] pointer-events-auto",
          "rounded-2xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xl shadow-slate-900/15",
          "bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl",
          "p-5 space-y-4 transition-all duration-200 animate-in fade-in zoom-in-95",
        )}
      >
        {/* Top Progress & Header */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-primary/10 text-primary border border-primary/20">
              <Compass className="h-3 w-3 animate-spin" style={{ animationDuration: "12s" }} />
              STEP {currentStep.stepNumber} OF {totalSteps}
            </span>

            <button
              type="button"
              onClick={closeTour}
              className="h-6 w-6 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 grid place-items-center transition-colors"
              title="Close tour (Esc)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-gradient-to-r from-primary to-[oklch(0.62_0.2_260)] transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Step Title & Explanation */}
        <div className="space-y-1.5">
          <h3 className="text-base font-bold text-slate-900 dark:text-white font-display tracking-tight flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded-md bg-primary text-white text-[11px] font-mono">
              {currentStep.stepNumber}
            </span>
            <span>{currentStep.title}</span>
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {currentStep.explanation}
          </p>

          {currentStep.actionHint && (
            <p className="text-[11px] text-primary/90 dark:text-primary/80 font-medium flex items-center gap-1 pt-1">
              <Sparkles className="h-3 w-3 shrink-0" />
              <span>{currentStep.actionHint}</span>
            </p>
          )}
        </div>

        {/* Step Footer Actions */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={closeTour}
            className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2">
            {currentStepIndex > 0 && (
              <button
                type="button"
                onClick={prevStep}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </button>
            )}

            <button
              type="button"
              onClick={nextStep}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-primary to-[oklch(0.62_0.2_260)] text-white text-xs font-bold shadow-md shadow-primary/20 hover:opacity-95 active:scale-95 transition-all"
            >
              <span>{isLastStep ? "Finish" : "Next"}</span>
              {isLastStep ? <Check className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
