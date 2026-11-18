import { useState, useEffect, useMemo } from "react";
import { Check, Layers, Grid, Lock, Minimize2, Maximize2 } from "lucide-react";
import { useMigration } from "@/lib/migration/store";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const STAGES = [
  { id: 0, label: "Instructions", path: "/app/instructions" },
  { id: 1, label: "Upload", path: "/app" },
  { id: 2, label: "QVW Analysis", path: "/app/qvw-analysis" },
  { id: 3, label: "Expression Conversion", path: "/app/expression-conversion" },
  { id: 4, label: "ETL Analysis", path: "/app/analysis" },
  { id: 5, label: "Power Query", path: "/app/power-query" },
  { id: 6, label: "DAX Measures", path: "/app/dax-measures" },
  { id: 7, label: "Power BI Model", path: "/app/powerbi-model" },
  { id: 8, label: "Relationships", path: "/app/relationships" },
  { id: 9, label: "Validation & Export", path: "/app/semantic-model" },
  { id: 10, label: "Logs", path: "/app/logs" },
] as const;

export type NavViewMode = "default" | "compact" | "all-stages";

export function StageNav() {
  const router = useRouterState();
  const currentPath = router.location.pathname;
  const { enterpriseAnalysis, enterpriseFiles, qvwAnalysis, expressionInventory, powerBiModel } = useMigration();
  const { isDemo } = useAuth();

  const normalizedPath = currentPath === "/app/" ? "/app" : currentPath;
  const activeIndex = STAGES.findIndex((stage) => stage.path === normalizedPath);

  const isStageComplete = (stage: (typeof STAGES)[number], index: number) => {
    if (stage.path === "/app/instructions") return activeIndex > index;
    if (stage.path === "/app") return enterpriseFiles.length > 0 && activeIndex > index;
    if (stage.path === "/app/qvw-analysis")
      return Boolean(qvwAnalysis?.intake.readyForVisualizationAnalysis) && activeIndex > index;
    if (stage.path === "/app/expression-conversion") return Boolean(expressionInventory) && activeIndex > index;
    if (stage.path === "/app/analysis") return Boolean(enterpriseAnalysis) && activeIndex > index;
    if (stage.path === "/app/powerbi-model" || stage.path === "/app/relationships")
      return Boolean(powerBiModel) && activeIndex > index;
    return activeIndex > index;
  };

  const phases = [
    { id: 1, name: "Capture & Extract", subtitle: "Steps 1–3", start: 0, end: 2 },
    { id: 2, name: "Analyze & Convert", subtitle: "Steps 4–7", start: 3, end: 6 },
    { id: 3, name: "Validate & Deploy", subtitle: "Steps 8–11", start: 7, end: 10 },
  ];

  const activePhaseId = useMemo(() => {
    if (activeIndex <= 2) return 1;
    if (activeIndex <= 6) return 2;
    return 3;
  }, [activeIndex]);

  const [selectedPhase, setSelectedPhase] = useState<number>(activePhaseId);
  // Default View is the mandatory initial view state
  const [viewMode, setViewMode] = useState<NavViewMode>("default");

  // Keep selected phase aligned with the active stage when navigating stages,
  // without changing the user's chosen viewMode
  useEffect(() => {
    setSelectedPhase(activePhaseId);
  }, [activePhaseId]);

  return (
    <div
      id="migration-stage-menu"
      className={cn(
        "glass-card mb-6 scroll-mt-24 border border-border/80 shadow-md rounded-2xl transition-all",
        viewMode === "compact" ? "p-3 sm:py-3 sm:px-4 rounded-xl shadow-sm" : "p-4 sm:p-5",
      )}
    >
      {/* Top Header & Phase Tabs */}
      <div
        className={cn(
          "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-border/60",
          viewMode === "compact" ? "pb-2.5" : "pb-3.5",
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "grid shrink-0 place-items-center rounded-xl bg-primary/10 text-primary border border-primary/20",
              viewMode === "compact" ? "h-8 w-8 rounded-lg" : "h-10 w-10",
            )}
          >
            <Layers className={cn(viewMode === "compact" ? "h-4 w-4" : "h-5 w-5")} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
              <span>Pipeline Navigation</span>
              <span className="text-muted-foreground/50">•</span>
              <span className="text-muted-foreground font-medium">
                Stage {activeIndex >= 0 ? activeIndex + 1 : "?"} of 11
              </span>
            </div>
            <h2
              className={cn(
                "font-display font-bold text-foreground leading-tight mt-0.5",
                viewMode === "compact" ? "text-base" : "text-lg",
              )}
            >
              {activeIndex >= 0 ? STAGES[activeIndex].label : "Migration Engine"}
            </h2>
          </div>
        </div>

        {/* Phase Tabs Selector & View Controls */}
        <div className="flex flex-wrap items-center gap-1.5 bg-surface/80 p-1 rounded-xl border border-border/60 shadow-inner">
          {phases.map((phase) => {
            const isCurrentPhase = selectedPhase === phase.id;
            const hasActiveStage = activeIndex >= phase.start && activeIndex <= phase.end;
            const isPhase3Locked = isDemo && phase.id === 3;

            return (
              <button
                key={phase.id}
                onClick={() => {
                  if (isPhase3Locked) {
                    window.dispatchEvent(new CustomEvent("open-demo-ended-modal"));
                    toast.info("🔒 Demo ended at Phase 2 (DAX Measures). Phase 3 is locked in Demo Version.");
                    return;
                  }
                  setSelectedPhase(phase.id);
                  if (viewMode === "all-stages") setViewMode("default");
                }}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  isCurrentPhase && viewMode !== "all-stages"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : isPhase3Locked
                    ? "text-muted-foreground/60 hover:text-foreground hover:bg-muted/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <span>Phase {phase.id}: {phase.name}</span>
                {isPhase3Locked && <Lock className="h-3 w-3 text-muted-foreground/70" />}
                {hasActiveStage && !isPhase3Locked && (
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      isCurrentPhase && viewMode !== "all-stages" ? "bg-white animate-pulse" : "bg-primary",
                    )}
                  />
                )}
              </button>
            );
          })}

          <div className="h-4 w-px bg-border mx-1 hidden sm:block" />

          {/* All Stages Toggle Button */}
          <button
            onClick={() => setViewMode((v) => (v === "all-stages" ? "default" : "all-stages"))}
            title="Toggle All 11 Stages View"
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
              viewMode === "all-stages"
                ? "bg-accent text-accent-foreground border border-accent-foreground/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <Grid className="h-3.5 w-3.5" />
            <span className="hidden md:inline">All Stages</span>
          </button>

          {/* Compact View Toggle Button */}
          <button
            onClick={() => setViewMode((v) => (v === "compact" ? "default" : "compact"))}
            title={viewMode === "compact" ? "Switch to Default View" : "Switch to Compact View"}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
              viewMode === "compact"
                ? "bg-accent text-accent-foreground border border-accent-foreground/30 font-bold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            {viewMode === "compact" ? (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Default View</span>
              </>
            ) : (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Compact View</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stage Pills Area */}
      <div className={cn(viewMode === "compact" ? "mt-2.5" : "mt-3.5")}>
        {viewMode === "all-stages" ? (
          /* All Stages Grid View (User Selected via 'All Stages') */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 animate-in fade-in duration-200">
            {phases.map((phase) => (
              <div key={phase.id} className="surface-card p-3 bg-surface/40 border border-border/60 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1 flex justify-between">
                  <span>Phase {phase.id}: {phase.name}</span>
                  <span>{phase.subtitle}</span>
                </div>
                <div className="grid gap-1.5">
                  {STAGES.slice(phase.start, phase.end + 1).map((stage, idx) => {
                    const actualIdx = phase.start + idx;
                    const isActive = actualIdx === activeIndex;
                    const isPast = isStageComplete(stage, actualIdx);
                    const isLocked = isDemo && actualIdx >= 7;
                    return (
                      <StagePill
                        key={stage.id}
                        stage={stage}
                        index={actualIdx}
                        isActive={isActive}
                        isPast={isPast}
                        isLocked={isLocked}
                        size="normal"
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : viewMode === "compact" ? (
          /* Compact View (Reduced-Height, User Selected via 'Compact View') */
          <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-200">
            {(() => {
              const p = phases.find((p) => p.id === selectedPhase)!;
              return STAGES.slice(p.start, p.end + 1).map((stage, idx) => {
                const actualIdx = p.start + idx;
                const isActive = actualIdx === activeIndex;
                const isPast = isStageComplete(stage, actualIdx);
                const isLocked = isDemo && actualIdx >= 7;
                return (
                  <StagePill
                    key={stage.id}
                    stage={stage}
                    index={actualIdx}
                    isActive={isActive}
                    isPast={isPast}
                    isLocked={isLocked}
                    size="compact"
                  />
                );
              });
            })()}
          </div>
        ) : (
          /* Default View (Mandatory Initial State — Exactly matches reference screenshot) */
          <div className="flex flex-wrap items-center gap-2.5 animate-in fade-in duration-200">
            {(() => {
              const p = phases.find((p) => p.id === selectedPhase)!;
              return STAGES.slice(p.start, p.end + 1).map((stage, idx) => {
                const actualIdx = p.start + idx;
                const isActive = actualIdx === activeIndex;
                const isPast = isStageComplete(stage, actualIdx);
                const isLocked = isDemo && actualIdx >= 7;
                return (
                  <StagePill
                    key={stage.id}
                    stage={stage}
                    index={actualIdx}
                    isActive={isActive}
                    isPast={isPast}
                    isLocked={isLocked}
                    size="large"
                  />
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

function StagePill({
  stage,
  index,
  isActive,
  isPast,
  isLocked = false,
  size = "normal",
}: {
  stage: (typeof STAGES)[number];
  index: number;
  isActive: boolean;
  isPast: boolean;
  isLocked?: boolean;
  size?: "normal" | "large" | "compact";
}) {
  if (isLocked) {
    return (
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new CustomEvent("open-demo-ended-modal"));
          toast.info(`🔒 ${stage.label} is locked in the Demo Version. Contact for more.`);
        }}
        title={`${stage.label} is locked in Demo Version — Click to view details`}
        className={cn(
          "group flex items-center gap-2 rounded-xl border border-border/40 bg-surface/20 transition-all duration-200 opacity-60 hover:opacity-100 hover:border-amber-500/50 cursor-pointer select-none text-left",
          size === "large"
            ? "px-4 py-3 text-sm font-semibold flex-1 min-w-[200px]"
            : size === "compact"
            ? "px-3 py-1.5 text-xs font-medium rounded-lg"
            : "px-3 py-2 text-xs font-medium w-full",
        )}
      >
        <div
          className={cn(
            "grid shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold",
            size === "large" ? "h-7 w-7 text-xs" : size === "compact" ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[10px]",
          )}
        >
          <Lock className={cn(size === "large" ? "h-3.5 w-3.5" : "h-3 w-3")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-muted-foreground flex items-center gap-1.5">
            <span>{stage.label}</span>
            <span className="text-[10px] uppercase font-bold text-amber-600/80 dark:text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded">
              Locked
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <Link
      to={stage.path}
      onClick={() => {
        if (stage.path === "/app") {
          window.dispatchEvent(new CustomEvent("open-upload-modal"));
        }
      }}
      className={cn(
        "group flex items-center gap-2.5 rounded-xl border transition-all duration-200",
        size === "large"
          ? "px-4 py-3 text-sm font-semibold flex-1 min-w-[200px]"
          : size === "compact"
          ? "px-3 py-1.5 text-xs font-medium rounded-lg"
          : "px-3 py-2 text-xs font-medium w-full",
        isActive
          ? "border-primary/80 bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20 scale-[1.01]"
          : isPast
          ? "border-border/80 bg-surface/80 text-foreground hover:bg-surface hover:border-primary/40"
          : "border-border/40 bg-surface/30 text-muted-foreground hover:bg-surface/60 hover:text-foreground",
      )}
    >
      <div
        className={cn(
          "grid shrink-0 place-items-center rounded-lg transition-colors font-bold",
          size === "large" ? "h-7 w-7 text-xs" : size === "compact" ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[10px]",
          isActive
            ? "bg-primary text-primary-foreground"
            : isPast
            ? "bg-success/20 text-success border border-success/30"
            : "bg-muted text-muted-foreground",
        )}
      >
        {isPast ? <Check className={cn(size === "large" ? "h-4 w-4" : "h-3.5 w-3.5")} /> : index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate">{stage.label}</div>
        {size === "large" && stage.path === "/app/qvw-analysis" && !isActive && (
          <div className="text-[10px] text-muted-foreground font-normal truncate">
            optional for QVS-only
          </div>
        )}
      </div>
      {isActive && <span className="h-2 w-2 rounded-full bg-primary animate-ping" />}
    </Link>
  );
}
