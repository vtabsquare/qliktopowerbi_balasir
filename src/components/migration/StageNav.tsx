import { useState, useEffect, useMemo } from "react";
import { Check, Layers, Grid } from "lucide-react";
import { useMigration } from "@/lib/migration/store";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";

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

export function StageNav() {
  const router = useRouterState();
  const currentPath = router.location.pathname;
  const { enterpriseAnalysis, enterpriseFiles, qvwAnalysis, expressionInventory, powerBiModel } = useMigration();

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
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setSelectedPhase(activePhaseId);
  }, [activePhaseId]);

  return (
    <div id="migration-stage-menu" className="glass-card mb-6 p-4 sm:p-5 scroll-mt-24 border border-border/80 shadow-md rounded-2xl transition-all">
      {/* Top Header & Phase Tabs */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-border/60 pb-3.5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
              <span>Pipeline Navigation</span>
              <span className="text-muted-foreground/50">•</span>
              <span className="text-muted-foreground font-medium">Stage {activeIndex >= 0 ? activeIndex + 1 : "?"} of 11</span>
            </div>
            <h2 className="font-display text-lg font-bold text-foreground leading-tight mt-0.5">
              {activeIndex >= 0 ? STAGES[activeIndex].label : "Migration Engine"}
            </h2>
          </div>
        </div>

        {/* Phase Tabs Selector */}
        <div className="flex flex-wrap items-center gap-1.5 bg-surface/80 p-1 rounded-xl border border-border/60 shadow-inner">
          {phases.map((phase) => {
            const isCurrentPhase = selectedPhase === phase.id;
            const hasActiveStage = activeIndex >= phase.start && activeIndex <= phase.end;
            return (
              <button
                key={phase.id}
                onClick={() => {
                  setSelectedPhase(phase.id);
                  setShowAll(false);
                }}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  isCurrentPhase && !showAll
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <span>Phase {phase.id}: {phase.name}</span>
                {hasActiveStage && (
                  <span className={cn("h-1.5 w-1.5 rounded-full", isCurrentPhase && !showAll ? "bg-white animate-pulse" : "bg-primary")} />
                )}
              </button>
            );
          })}
          <div className="h-4 w-px bg-border mx-1 hidden sm:block" />
          <button
            onClick={() => setShowAll((v) => !v)}
            title="Toggle All 11 Stages View"
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
              showAll
                ? "bg-accent text-accent-foreground border border-accent-foreground/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <Grid className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{showAll ? "Compact" : "All Stages"}</span>
          </button>
        </div>
      </div>

      {/* Stage Pills Area */}
      <div className="mt-3.5">
        {showAll ? (
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
                    return <StagePill key={stage.id} stage={stage} index={actualIdx} isActive={isActive} isPast={isPast} />;
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-200">
            {(() => {
              const p = phases.find((p) => p.id === selectedPhase)!;
              return STAGES.slice(p.start, p.end + 1).map((stage, idx) => {
                const actualIdx = p.start + idx;
                const isActive = actualIdx === activeIndex;
                const isPast = isStageComplete(stage, actualIdx);
                return <StagePill key={stage.id} stage={stage} index={actualIdx} isActive={isActive} isPast={isPast} size="large" />;
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
  size = "normal",
}: {
  stage: (typeof STAGES)[number];
  index: number;
  isActive: boolean;
  isPast: boolean;
  size?: "normal" | "large";
}) {
  return (
    <Link
      to={stage.path}
      className={cn(
        "group flex items-center gap-2.5 rounded-xl border transition-all duration-200",
        size === "large" ? "px-4 py-2.5 text-sm font-semibold flex-1 min-w-[200px]" : "px-3 py-2 text-xs font-medium w-full",
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
          size === "large" ? "h-7 w-7 text-xs" : "h-6 w-6 text-[10px]",
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
        {stage.path === "/app/qvw-analysis" && !isActive && (
          <div className="text-[10px] text-muted-foreground font-normal truncate">optional for QVS-only</div>
        )}
      </div>
      {isActive && <span className="h-2 w-2 rounded-full bg-primary animate-ping" />}
    </Link>
  );
}
