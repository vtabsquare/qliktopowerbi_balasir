import { useState, useEffect, useMemo, useCallback } from "react";
import { Check, Layers, Grid, Lock, Minimize2, Maximize2, PanelLeftClose, PanelLeftOpen, Menu, X, Calendar, LayoutTemplate, ScrollText, Workflow } from "lucide-react";
import { useMigration } from "@/lib/migration/store";
import { cn } from "@/lib/utils";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  WORKFLOW_STEPS,
  isStepCompleted,
  isStepUnlocked,
  getFirstIncompleteStep,
  getCompletedSteps,
} from "@/lib/migration/workflow-gating";
import { useNavigationLoading } from "@/components/common/NavigationLoadingOverlay";

export const STAGES = WORKFLOW_STEPS.map((s) => ({
  id: s.id,
  label: s.label,
  path: s.path,
  stepNumber: s.stepNumber,
  phase: s.phase,
}));

export type NavViewMode = "default" | "compact" | "all-stages";

export interface StageNavProps {
  activeStepId?: number;
  onStepSelect?: (stage: (typeof STAGES)[number]) => void;
  viewportDocked?: boolean;
}

export function StageNav({ activeStepId, onStepSelect, viewportDocked = false }: StageNavProps = {}) {
  const router = useRouterState();
  const navigate = useNavigate();
  const currentPath = router.location.pathname;
  const isDemoRoute = currentPath.startsWith("/demo");
  const { enterpriseAnalysis, enterpriseFiles, qvwAnalysis, expressionInventory, powerBiModel } = useMigration();
  const { isDemo: authIsDemo } = useAuth();
  const isDemo = authIsDemo || isDemoRoute;
  const { withLoading } = useNavigationLoading();

  const [completedStepsState, setCompletedStepsState] = useState<number[]>(() => getCompletedSteps(isDemo));

  // Sync completed steps when event fires or store updates
  useEffect(() => {
    const handleSync = () => {
      setCompletedStepsState(getCompletedSteps(isDemo));
    };
    window.addEventListener("workflow-step-completed", handleSync);
    return () => window.removeEventListener("workflow-step-completed", handleSync);
  }, [isDemo]);

  const normalizedPath = currentPath === "/app/" ? "/app" : currentPath;

  const activeIndex = useMemo(() => {
    if (typeof activeStepId === "number") {
      return activeStepId;
    }
    if (isDemoRoute) {
      if (typeof window !== "undefined") {
        const urlSearchStep = new URLSearchParams(window.location.search).get("step");
        if (urlSearchStep) {
          const found = STAGES.findIndex(
            (s) => WORKFLOW_STEPS[s.id]?.demoStepParam === urlSearchStep || s.id === Number(urlSearchStep),
          );
          if (found >= 0) return found;
        }
      }
      return 0;
    }
    const idx = STAGES.findIndex((stage) => stage.path === normalizedPath);
    return idx >= 0 ? idx : 0;
  }, [activeStepId, currentPath, isDemoRoute, normalizedPath]);

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
  const [viewMode, setViewMode] = useState<NavViewMode>(viewportDocked ? "compact" : "default");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    setSelectedPhase(activePhaseId);
  }, [activePhaseId]);

  const handleStageNavigation = useCallback(
    (targetStage: (typeof STAGES)[number]) => {
      const targetIdx = targetStage.id;
      const unlocked = isStepUnlocked(targetIdx, isDemo);

      if (!unlocked) {
        if (isDemo && targetStage.phase === 3) {
          window.dispatchEvent(new CustomEvent("open-demo-ended-modal"));
          toast.info(`🔒 ${targetStage.label} is locked in Demo Version. Contact for Phase 3 access.`);
          return;
        }

        const incomplete = getFirstIncompleteStep(targetIdx, isDemo);
        toast.error(
          `Please complete Step ${incomplete.stepNumber} (${incomplete.label}) before proceeding to Step ${targetStage.stepNumber} (${targetStage.label}).`,
          {
            action: {
              label: `Go to Step ${incomplete.stepNumber}`,
              onClick: () => {
                if (isDemoRoute) {
                  if (onStepSelect) {
                    onStepSelect(STAGES[incomplete.id]);
                  } else {
                    window.dispatchEvent(new CustomEvent("demo-set-active-step", { detail: { stepId: incomplete.id } }));
                  }
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

      if (isDemoRoute) {
        if (targetIdx === activeIndex) return;
        withLoading(
          async () => {
            if (targetStage.id === 1) {
              window.dispatchEvent(new CustomEvent("open-upload-modal"));
            }
            if (onStepSelect) {
              onStepSelect(targetStage);
            } else {
              window.dispatchEvent(new CustomEvent("demo-set-active-step", { detail: { stepId: targetStage.id } }));
              const targetUrl = new URL(window.location.href);
              targetUrl.searchParams.set("step", WORKFLOW_STEPS[targetStage.id]?.demoStepParam || String(targetStage.id));
              window.history.pushState({}, "", targetUrl.toString());
            }
          },
          { message: `Loading ${targetStage.label}...`, subMessage: "Preparing demo stage workspace..." },
        );
        return;
      }

      if (targetStage.path === normalizedPath) return;

      withLoading(
        async () => {
          if (targetStage.path === "/app") {
            window.dispatchEvent(new CustomEvent("open-upload-modal"));
          }
          await navigate({ to: targetStage.path });
        },
        { message: `Loading ${targetStage.label}...`, subMessage: "Preparing stage workspace..." },
      );
    },
    [activeIndex, isDemo, isDemoRoute, navigate, normalizedPath, onStepSelect, withLoading],
  );

  if (viewportDocked) {
    const activeStage = STAGES[activeIndex] || STAGES[0];
    const mainNavItems = [
      { label: "Pipeline", to: isDemo ? "/demo" : "/app", icon: Workflow, locked: false },
      { label: "Calendars", to: "/app/calendar-analysis", icon: Calendar, locked: isDemo },
      { label: "Report Designer", to: "/app/report-designer", icon: LayoutTemplate, locked: isDemo },
      { label: "Logs", to: "/app/logs", icon: ScrollText, locked: isDemo },
    ];

    const renderSidebarBrandAndNav = (collapsed: boolean, onSelectClose?: () => void) => (
      <div className="border-b border-border/60 p-2.5 space-y-2.5">
        <div className={cn("flex items-center gap-2.5", collapsed ? "justify-center" : "px-1")}>
          <Link to="/" className="flex shrink-0 items-center gap-2.5 group" onClick={onSelectClose}>
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.62_0.2_260)] text-primary-foreground font-bold shadow-sm group-hover:scale-105 transition-transform">
              <span className="text-xs tracking-tight">VT</span>
            </div>
            {!collapsed && (
              <div className="leading-tight">
                <div className="font-display font-bold text-sm tracking-wide text-foreground">VTAB SQUARE</div>
                <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  <span>AI MIGRATION ENGINE v2.0</span>
                </div>
              </div>
            )}
          </Link>
        </div>

        <nav aria-label="Main navigation" className={cn("grid gap-1", collapsed ? "grid-cols-1" : "grid-cols-2")}>
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            if (item.locked) {
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => toast.info(`🔒 ${item.label} is locked in the Demo Version.`)}
                  title={`${item.label} is locked in Demo Version`}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium text-muted-foreground/50 opacity-50 cursor-not-allowed",
                    collapsed && "justify-center px-1",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            }
            const isCurrent =
              item.to === "/app"
                ? normalizedPath === "/app" || normalizedPath.startsWith("/app/") && !["/app/calendar-analysis", "/app/report-designer", "/app/logs"].includes(normalizedPath)
                : item.to === "/demo"
                ? isDemoRoute
                : normalizedPath === item.to;
            return (
              <Link
                key={item.label}
                to={item.to}
                onClick={onSelectClose}
                title={item.label}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors",
                  collapsed && "justify-center px-1",
                  isCurrent
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>
    );

    const renderVerticalList = (collapsed: boolean, onSelectClose?: () => void) => (
      <div className="flex flex-col gap-3 p-2.5">
        {phases.map((phase) => (
          <div key={phase.id} className="space-y-1">
            {!collapsed && (
              <div className="flex items-center justify-between px-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>Phase {phase.id}: {phase.name}</span>
                {isDemo && phase.id === 3 && <Lock className="h-3 w-3 text-amber-500" />}
              </div>
            )}
            <div className="space-y-1">
              {STAGES.slice(phase.start, phase.end + 1).map((stage, idx) => {
                const actualIdx = phase.start + idx;
                const isActive = actualIdx === activeIndex;
                const isCompleted = isStepCompleted(actualIdx, isDemo);
                const isLocked = !isStepUnlocked(actualIdx, isDemo);
                const prereq = isLocked ? getFirstIncompleteStep(actualIdx, isDemo) : null;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => {
                      onSelectClose?.();
                      handleStageNavigation(stage);
                    }}
                    title={
                      isLocked && prereq
                        ? `Locked: Complete Step ${prereq.stepNumber} (${prereq.label}) first`
                        : `Step ${stage.stepNumber}: ${stage.label}`
                    }
                    className={cn(
                      "group flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-xs font-medium transition-all",
                      collapsed && "justify-center px-1.5",
                      isLocked
                        ? "border-border/40 bg-surface/20 opacity-65 hover:opacity-100 hover:border-amber-500/50"
                        : isActive
                        ? "border-primary/80 bg-primary/15 text-primary shadow-xs ring-1 ring-primary/20"
                        : isCompleted
                        ? "border-border/70 bg-surface/80 text-foreground hover:bg-surface hover:border-primary/40"
                        : "border-transparent bg-transparent text-muted-foreground hover:bg-surface/60 hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[10px] font-bold transition-colors",
                        isLocked
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : isActive
                          ? "bg-primary text-primary-foreground"
                          : isCompleted
                          ? "bg-success/20 text-success border border-success/30"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {isLocked ? (
                        <Lock className="h-3 w-3" />
                      ) : isCompleted ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        stage.stepNumber
                      )}
                    </span>
                    {!collapsed && (
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{stage.label}</div>
                        {isLocked && prereq && (
                          <div className="truncate text-[10px] text-amber-600/80 dark:text-amber-400/80">
                            Requires Step {prereq.stepNumber}
                          </div>
                        )}
                      </div>
                    )}
                    {!collapsed && isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );

    return (
      <>
        {/* Mobile compact bar + slide-over drawer */}
        <div className="flex items-center justify-between border-b border-border/50 bg-surface/80 px-3 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground"
            aria-label="Open workflow steps menu"
          >
            <Menu className="h-4 w-4" />
            <span>Step {activeStage.stepNumber} of {STAGES.length}: {activeStage.label}</span>
          </button>
          <span className="text-[11px] font-medium text-muted-foreground">
            Phase {activeStage.phase}
          </span>
        </div>

        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div className="fixed inset-0 bg-background/80 backdrop-blur-xs" onClick={() => setMobileDrawerOpen(false)} />
            <aside className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-surface shadow-2xl">
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                  <Layers className="h-4 w-4" />
                  <span>Migration Steps</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Close workflow steps menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {renderSidebarBrandAndNav(false, () => setMobileDrawerOpen(false))}
                {renderVerticalList(false, () => setMobileDrawerOpen(false))}
              </div>
            </aside>
          </div>
        )}

        {/* Desktop vertical left-side navigation panel */}
        <aside
          id="migration-stage-menu"
          aria-label="Migration stages"
          className={cn(
            "hidden md:flex md:flex-col md:shrink-0 md:border-r md:border-border/60 md:bg-surface/70 md:backdrop-blur-md transition-all duration-200",
            sidebarCollapsed ? "md:w-16" : "md:w-64 lg:w-72",
          )}
        >
          {renderSidebarBrandAndNav(sidebarCollapsed)}
          <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2 min-w-0">
                <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Workflow ({activeStage.stepNumber}/{STAGES.length})
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground mx-auto md:mx-0"
              title={sidebarCollapsed ? "Expand navigation panel" : "Collapse navigation panel"}
              aria-label={sidebarCollapsed ? "Expand navigation panel" : "Collapse navigation panel"}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {renderVerticalList(sidebarCollapsed)}
          </div>
        </aside>
      </>
    );
  }

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
              <span>Pipeline Workflow Engine</span>
              <span className="text-muted-foreground/50">•</span>
              <span className="text-muted-foreground font-medium">
                Step {activeIndex >= 0 ? activeIndex + 1 : "?"} of 11
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
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
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
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
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
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
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
                    const isCompleted = isStepCompleted(actualIdx, isDemo);
                    const isLocked = !isStepUnlocked(actualIdx, isDemo);
                    return (
                      <StagePill
                        key={stage.id}
                        stage={stage}
                        index={actualIdx}
                        isActive={isActive}
                        isCompleted={isCompleted}
                        isLocked={isLocked}
                        onNavigate={() => handleStageNavigation(stage)}
                        size="normal"
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : viewMode === "compact" ? (
          <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-200">
            {(() => {
              const p = phases.find((phase) => phase.id === selectedPhase) || phases[0];
              return STAGES.slice(p.start, p.end + 1).map((stage, idx) => {
                const actualIdx = p.start + idx;
                const isActive = actualIdx === activeIndex;
                const isCompleted = isStepCompleted(actualIdx, isDemo);
                const isLocked = !isStepUnlocked(actualIdx, isDemo);
                return (
                  <StagePill
                    key={stage.id}
                    stage={stage}
                    index={actualIdx}
                    isActive={isActive}
                    isCompleted={isCompleted}
                    isLocked={isLocked}
                    onNavigate={() => handleStageNavigation(stage)}
                    size="compact"
                  />
                );
              });
            })()}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5 animate-in fade-in duration-200">
            {(() => {
              const p = phases.find((phase) => phase.id === selectedPhase) || phases[0];
              return STAGES.slice(p.start, p.end + 1).map((stage, idx) => {
                const actualIdx = p.start + idx;
                const isActive = actualIdx === activeIndex;
                const isCompleted = isStepCompleted(actualIdx, isDemo);
                const isLocked = !isStepUnlocked(actualIdx, isDemo);
                return (
                  <StagePill
                    key={stage.id}
                    stage={stage}
                    index={actualIdx}
                    isActive={isActive}
                    isCompleted={isCompleted}
                    isLocked={isLocked}
                    onNavigate={() => handleStageNavigation(stage)}
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
  isCompleted,
  isLocked,
  onNavigate,
  size = "normal",
}: {
  stage: (typeof STAGES)[number];
  index: number;
  isActive: boolean;
  isCompleted: boolean;
  isLocked: boolean;
  onNavigate: () => void;
  size?: "normal" | "large" | "compact";
}) {
  if (isLocked) {
    return (
      <button
        type="button"
        onClick={onNavigate}
        title={`Step ${stage.stepNumber}: ${stage.label} is locked. Complete previous steps to unlock.`}
        className={cn(
          "group flex items-center gap-2 rounded-xl border border-border/50 bg-surface/20 transition-all duration-200 opacity-60 hover:opacity-100 hover:border-amber-500/50 cursor-pointer select-none text-left",
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
    <button
      type="button"
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-2.5 rounded-xl border transition-all duration-200 cursor-pointer text-left select-none",
        size === "large"
          ? "px-4 py-3 text-sm font-semibold flex-1 min-w-[200px]"
          : size === "compact"
          ? "px-3 py-1.5 text-xs font-medium rounded-lg"
          : "px-3 py-2 text-xs font-medium w-full",
        isActive
          ? "border-primary/80 bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20 scale-[1.01]"
          : isCompleted
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
            : isCompleted
            ? "bg-success/20 text-success border border-success/30"
            : "bg-muted text-muted-foreground",
        )}
      >
        {isCompleted ? <Check className={cn(size === "large" ? "h-4 w-4" : "h-3.5 w-3.5")} /> : index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{stage.label}</div>
        {size === "large" && stage.path === "/app/qvw-analysis" && !isActive && (
          <div className="text-[10px] text-muted-foreground font-normal truncate">
            optional for QVS-only
          </div>
        )}
      </div>
      {isActive && <span className="h-2 w-2 rounded-full bg-primary animate-ping" />}
    </button>
  );
}
