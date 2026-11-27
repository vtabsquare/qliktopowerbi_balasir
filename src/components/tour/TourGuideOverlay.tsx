import { useEffect, useState, useRef, useCallback } from "react";
import { useTour } from "@/contexts/TourContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Compass,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TourStep } from "@/lib/tour/tour-config";

export interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function checkElementViewportVisibility(
  rect: { top: number; bottom: number; width: number; height: number } | null,
  viewportHeight: number = typeof window !== "undefined" ? window.innerHeight : 800,
) {
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    return { isBelow: false, isAbove: false, isInView: false };
  }
  const isBelow = rect.top > viewportHeight - 80;
  const isAbove = rect.bottom < 50;
  const isInView = !isBelow && !isAbove && rect.width > 0 && rect.height > 0;
  return { isBelow, isAbove, isInView };
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
  const { isDemo } = useAuth();
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
  const [isTargetBelowViewport, setIsTargetBelowViewport] = useState(false);
  const [isTargetAboveViewport, setIsTargetAboveViewport] = useState(false);
  const [elementNotFoundTimedOut, setElementNotFoundTimedOut] = useState(false);
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

      const { isBelow, isAbove, isInView } = checkElementViewportVisibility(rect, viewportHeight);

      setIsTargetBelowViewport(isBelow);
      setIsTargetAboveViewport(isAbove);
      setIsElementVisible(isInView);

      if (isInView) {
        // Preferred directional placement handling
        const preferredPlacement = currentStep.placement || "auto";
        let top = 0;
        let left = 0;

        if (preferredPlacement === "left") {
          left = highlight.left - tooltipWidth - 14;
          // For targets in the bottom section of a modal (such as upload-done), align top near the target to avoid overlapping cards above
          if (currentStep.id === "upload-done" || highlight.top > viewportHeight * 0.58) {
            top = Math.max(16, highlight.top - 6);
          } else {
            top = highlight.top + (highlight.height - tooltipHeight) / 2;
          }
          if (left < 16) {
            if (highlight.left + highlight.width + 14 + tooltipWidth <= viewportWidth - 16) {
              left = highlight.left + highlight.width + 14;
            } else {
              left = 16;
            }
          }
        } else if (preferredPlacement === "right") {
          left = highlight.left + highlight.width + 14;
          top = highlight.top + (highlight.height - tooltipHeight) / 2;
          if (left + tooltipWidth > viewportWidth - 16) {
            if (highlight.left - tooltipWidth - 14 >= 16) {
              left = highlight.left - tooltipWidth - 14;
            } else {
              left = viewportWidth - tooltipWidth - 16;
            }
          }
        } else if (preferredPlacement === "top") {
          // Place directly above the highlight, clamped safely within top viewport margin
          top = Math.max(16, highlight.top - tooltipHeight - 12);
          left = highlight.left + (highlight.width - tooltipWidth) / 2;
        } else {
          // bottom or auto
          top = highlight.top + highlight.height + 14;
          left = highlight.left + (highlight.width - tooltipWidth) / 2;
          if (top + tooltipHeight > viewportHeight - 20) {
            const spaceAbove = highlight.top - 14 - tooltipHeight;
            if (spaceAbove > 20) {
              top = spaceAbove;
            } else {
              top = Math.max(16, (viewportHeight - tooltipHeight) / 2);
            }
          }
        }

        // Horizontal alignment: clamp within viewport
        left = Math.max(16, Math.min(left, viewportWidth - tooltipWidth - 16));

        // Vertical clamping: ALWAYS keep tooltip visible within viewport boundaries
        top = Math.max(16, Math.min(top, viewportHeight - tooltipHeight - 16));

        setTooltipPos({ top, left });
      }
    } else {
      setIsElementVisible(false);
      setIsTargetBelowViewport(false);
      setIsTargetAboveViewport(false);
      setTargetRect(null);

      // Centered fallback when element is mounting
      const top = Math.max(40, (viewportHeight - tooltipHeight) / 2);
      const left = Math.max(16, (viewportWidth - tooltipWidth) / 2);
      setTooltipPos({ top, left });
    }
  }, [isOpen, currentStep]);

  // Handle scrolling to the target element when user clicks the scroll indicator
  const handleScrollToTarget = useCallback(() => {
    if (!currentStep) return;
    const element = findTourElement(currentStep);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  }, [currentStep]);

  // Observe and poll for element when step changes without forcing an abrupt jump to bottom
  useEffect(() => {
    if (!isOpen || !currentStep) return;

    setElementNotFoundTimedOut(false);
    let attempts = 0;
    const maxAttempts = 40; // 40 * 60ms = 2.4s

    const poll = () => {
      const element = findTourElement(currentStep);
      if (element) {
        updatePosition();
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(poll, 60);
      } else {
        setElementNotFoundTimedOut(true);
        updatePosition();
      }
    };

    poll();

    // DOM MutationObserver to immediately detect dynamic mounting
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

  // Handle window resize and scroll smoothly via requestAnimationFrame
  useEffect(() => {
    if (!isOpen) return;

    let rafId: number | null = null;
    const handleWindowChange = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        updatePosition();
      });
    };

    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
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

  if (!isDemo || !isOpen || !currentStep) return null;

  const progressPercent = Math.round(((currentStepIndex + 1) / totalSteps) * 100);

  return (
    <div className="tour-guide-root fixed inset-0 z-[9995] pointer-events-none select-none">
      {/* ── 1. Spotlight Cutout Overlay (Only when element is visible in viewport) ── */}
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
            zIndex: 9996,
          }}
        >
          <div className="absolute -inset-1 rounded-[18px] ring-2 ring-primary/30 animate-pulse pointer-events-none" />
        </div>
      ) : null}

      {/* ── 2. Floating Tour Tooltip Card (Rendered when element is visible in viewport or fallback timed out) ── */}
      {(isElementVisible || (elementNotFoundTimedOut && !targetRect)) && (
        <div
          ref={tooltipRef}
          style={{
            position: "fixed",
            top: `${tooltipPos.top}px`,
            left: `${tooltipPos.left}px`,
            zIndex: 9998,
          }}
          className={cn(
            "w-[min(360px,calc(100vw-2rem))] pointer-events-auto",
            "rounded-2xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xl shadow-slate-900/15",
            "bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl",
            "p-4 space-y-3 transition-all duration-200 animate-in fade-in zoom-in-95",
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
                onClick={() => {
                  if (isLastStep) {
                    closeTour();
                  } else {
                    nextStep();
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-primary to-[oklch(0.62_0.2_260)] text-white text-xs font-bold shadow-md shadow-primary/20 hover:opacity-95 active:scale-95 transition-all"
              >
                <span>{isLastStep ? "Finish" : "Next"}</span>
                {isLastStep ? <Check className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. Scroll Down to Proceed Animation (Shown when target button is below the viewport fold) ── */}
      {isTargetBelowViewport && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9996] pointer-events-auto flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom-6 duration-300">
          <button
            type="button"
            onClick={handleScrollToTarget}
            className={cn(
              "group relative flex items-center gap-3.5 px-5 py-3 rounded-full shadow-2xl transition-all duration-300",
              "bg-slate-900/95 dark:bg-slate-950/95 text-white border-2 border-indigo-500/70 hover:border-indigo-400",
              "hover:scale-105 active:scale-95 cursor-pointer max-w-[calc(100vw-2rem)]",
              "shadow-[0_12px_36px_-6px_rgba(99,102,241,0.5)] backdrop-blur-xl",
            )}
            title="Scroll down to reach the next guided tour action"
          >
            {/* Glowing ripple */}
            <span className="absolute -inset-1 rounded-full bg-indigo-500/30 animate-pulse pointer-events-none" />

            {/* Bouncing down indicator icon with mini scroll mouse */}
            <div className="relative flex items-center justify-center h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500 to-primary text-white shadow-md shrink-0">
              <ArrowDown className="h-4.5 w-4.5 animate-bounce" />
            </div>

            {/* Text description */}
            <div className="relative flex flex-col text-left">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/25 text-indigo-300 border border-indigo-400/30">
                  STEP {currentStep.stepNumber} OF {totalSteps}
                </span>
                <span className="text-xs font-semibold text-slate-300 truncate max-w-[190px]">
                  {currentStep.shortLabel || currentStep.title}
                </span>
              </div>
              <span className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5 mt-0.5">
                <span>Scroll down to proceed</span>
                <ChevronDown className="h-4 w-4 animate-bounce text-indigo-400" />
              </span>
            </div>

            {/* Quick scroll action label */}
            <div className="relative flex items-center gap-1 pl-3 border-l border-slate-700/80 text-xs font-semibold text-indigo-300 group-hover:text-white transition-colors">
              <span>Scroll</span>
              <ArrowDown className="h-3.5 w-3.5" />
            </div>

            {/* Close tour button */}
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                closeTour();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  closeTour();
                }
              }}
              className="relative h-6 w-6 rounded-full hover:bg-white/20 text-slate-400 hover:text-white grid place-items-center transition-colors ml-1"
              title="Close tour (Esc)"
            >
              <X className="h-3.5 w-3.5" />
            </div>
          </button>

          {/* Helper caption */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/95 dark:bg-slate-900/95 text-slate-600 dark:text-slate-300 text-[11px] font-medium shadow-md border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping" />
            <span>The target action is below — scroll down or click to view</span>
          </div>
        </div>
      )}

      {/* ── 4. Scroll Up Indicator (Shown if user scrolled completely past target element) ── */}
      {isTargetAboveViewport && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9996] pointer-events-auto flex flex-col items-center animate-in fade-in slide-in-from-top-6 duration-300">
          <button
            type="button"
            onClick={handleScrollToTarget}
            className={cn(
              "group relative flex items-center gap-3 px-5 py-2.5 rounded-full shadow-2xl transition-all duration-300",
              "bg-slate-900/95 dark:bg-slate-950/95 text-white border-2 border-indigo-500/70 hover:border-indigo-400",
              "hover:scale-105 active:scale-95 cursor-pointer max-w-[calc(100vw-2rem)]",
              "shadow-[0_12px_36px_-6px_rgba(99,102,241,0.5)] backdrop-blur-xl",
            )}
            title="Scroll up to reach the action button"
          >
            <div className="relative flex items-center justify-center h-7 w-7 rounded-full bg-indigo-500 text-white shadow-md">
              <ArrowUp className="h-4 w-4 animate-bounce" />
            </div>
            <span className="text-xs font-bold">Scroll up to {currentStep.shortLabel || currentStep.title}</span>
          </button>
        </div>
      )}
    </div>
  );
}
