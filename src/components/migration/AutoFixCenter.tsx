import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Filter,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { EnterpriseAnalysis } from "@/lib/migration/enterprise-parser";
import { AUTO_FIX_PHASES, collectRepairIssues, issueFingerprint, type RepairArea, type RepairIssue } from "@/lib/migration/autofix";
import { useMigration } from "@/lib/migration/store";
import { cn } from "@/lib/utils";

interface Props {
  analysis: EnterpriseAnalysis;
  compact?: boolean;
}

type IssueFilter = "all" | "blocking" | RepairArea;

function sameIssues(left: string[] | undefined, right: string[]): boolean {
  if (!left) return false;
  return [...left].sort().join("|") === [...right].sort().join("|");
}

function severityTone(issue: RepairIssue): string {
  if (issue.severity === "blocking-error" || issue.severity === "error") return "border-red-500/30 bg-red-500/5 hover:border-red-500/50";
  if (issue.severity === "warning") return "border-amber-500/25 bg-amber-500/5 hover:border-amber-500/45";
  return "border-sky-500/20 bg-sky-500/5 hover:border-sky-500/40";
}

function targetLabel(issue: RepairIssue): string {
  if (issue.target.area === "dax") return `Open ${issue.objectName} measure`;
  if (issue.target.area === "data-types") return `Open ${issue.target.tableName || issue.objectName} column type`;
  if (issue.target.area === "power-query") return `Open ${issue.objectName} query`;
  if (issue.target.area === "source-mapping") return `Open ${issue.objectName} mapping`;
  if (issue.target.area === "relationships") return "Open exact relationship";
  if (issue.target.area === "model-tables") return `Open ${issue.objectName} table`;
  return "Open exact fix";
}

function targetPath(issue: RepairIssue): string {
  const parts = [issue.target.route.replace("/app/", "").replace(/-/g, " ")];
  if (issue.target.objectName) parts.push(issue.target.objectName);
  if (issue.target.tableName && issue.target.fieldName) parts.push(`${issue.target.tableName}[${issue.target.fieldName}]`);
  return parts.join(" → ");
}

function areaLabel(area: RepairArea): string {
  return area.replace(/-/g, " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

export function AutoFixCenter({ analysis, compact = false }: Props) {
  const navigate = useNavigate();
  const {
    powerBiModel,
    autoFixRunning,
    autoFixPhase,
    autoFixReport,
    runAutoFix,
    rollbackLastAutoFix,
    setRepairFocus,
    validationState,
  } = useMigration();
  const [proactive, setProactive] = useState(true);
  const [filter, setFilter] = useState<IssueFilter>("all");
  const attempted = useRef<string>("");
  const issues = useMemo(
    () => validationState.status === "stale" || validationState.status === "idle"
      ? collectRepairIssues(analysis, powerBiModel)
      : validationState.issues,
    [analysis, powerBiModel, validationState],
  );
  const blocking = issues.filter((issue) => issue.severity === "blocking-error" || issue.severity === "error");
  const fingerprint = issueFingerprint(issues);
  const reportCoversCurrent = sameIssues(autoFixReport?.remainingIssueIds, issues.map((issue) => issue.id));
  const visibleIssues = issues.filter((issue) => {
    if (filter === "all") return true;
    if (filter === "blocking") return issue.severity === "blocking-error" || issue.severity === "error";
    return issue.area === filter;
  });
  const areaCounts = useMemo(() => {
    const result = new Map<RepairArea, number>();
    for (const issue of issues) result.set(issue.area, (result.get(issue.area) || 0) + 1);
    return result;
  }, [issues]);

  const applyFixes = async (automatic = false) => {
    if (autoFixRunning) return;
    try {
      const report = await runAutoFix();
      if (!automatic) {
        const remainingCount = report.remainingIssueIds.length;
        const latestState = useMigration.getState();
        const latestIssues = collectRepairIssues(latestState.enterpriseAnalysis, latestState.powerBiModel);
        if (report.fixedCount > 0 && remainingCount === 0) {
          toast.success("AI Auto-Fix completed", {
            description: `${report.fixedCount} fix(es) were applied and verified. All validation issues are resolved.`,
          });
        } else if (report.fixedCount > 0 && remainingCount > 0) {
          toast.warning("AI Auto-Fix partially completed", {
            description: `${report.fixedCount} fix(es) applied. ${remainingCount} issue(s) still require your action.`,
          });
        } else if (remainingCount > 0) {
          const firstIssue = latestIssues[0];
          toast.warning("Manual action required", {
            description: firstIssue
              ? `0 automatic fixes could be safely applied. ${remainingCount} issue(s) remain: ${firstIssue.objectName} — ${firstIssue.recommendation}`
              : `0 automatic fixes could be safely applied. ${remainingCount} issue(s) require your review.`,
          });
        } else {
          toast.info("Validation verified", {
            description: "No unresolved migration issues were found.",
          });
        }
      }
    } catch (error) {
      toast.error("AI Auto-Fix could not complete", { description: error instanceof Error ? error.message : "Review the validation details and try again." });
    }
  };

  useEffect(() => {
    if (!proactive || !blocking.length || autoFixRunning || reportCoversCurrent || attempted.current === fingerprint) return;
    attempted.current = fingerprint;
    const timer = window.setTimeout(() => void applyFixes(true), 500);
    return () => window.clearTimeout(timer);
  }, [proactive, fingerprint, blocking.length, autoFixRunning, reportCoversCurrent]);

  useEffect(() => {
    if (filter !== "all" && filter !== "blocking" && !areaCounts.has(filter)) setFilter("all");
  }, [fingerprint, filter, areaCounts]);

  const goToFix = (issue: RepairIssue) => {
    setRepairFocus({ ...issue.target, code: issue.code, message: issue.message });
    navigate({ to: issue.target.route });
  };

  if (!issues.length) {
    return (
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600"><ShieldCheck className="h-5 w-5" /></span>
          <div><div className="text-sm font-semibold text-emerald-700">AI validation found no unresolved migration issues</div><div className="text-xs text-muted-foreground">The error list was refreshed after the latest repair. Source mappings, M queries, DAX, relationships and PBIP metadata currently pass validation.</div></div>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-1 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600">{autoFixRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <WandSparkles className="h-5 w-5" />}</span>
            <div>
              <div className="text-sm font-semibold">{autoFixRunning ? "AI Auto-Fix is repairing safe issues..." : `${blocking.length} blocking item(s) remain`}</div>
              <div className="mt-1 text-xs text-muted-foreground">The list refreshes automatically after every fix. Remaining cards open the exact editor and object.</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={autoFixRunning} onClick={() => void applyFixes(false)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Sparkles className="h-4 w-4" />Fix safe issues</button>
            {blocking[0] && <button onClick={() => goToFix(blocking[0])} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold"><MapPin className="h-4 w-4" />Go to first fix</button>}
          </div>
        </div>
      </div>
    );
  }

  const filters: Array<{ key: IssueFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: issues.length },
    { key: "blocking", label: "Blocking", count: blocking.length },
    ...[...areaCounts.entries()].map(([area, count]) => ({ key: area as IssueFilter, label: areaLabel(area), count })),
  ];

  return (
    <section className="surface-card overflow-hidden" id="ai-auto-fix-center">
      <div className="border-b border-border bg-gradient-to-r from-primary/10 via-background to-emerald-500/10 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg">{autoFixRunning ? <Loader2 className="h-6 w-6 animate-spin" /> : <WandSparkles className="h-6 w-6" />}</span>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-xl font-bold">AI Auto-Fix Center</h3><span className="rounded-full bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-600">{blocking.length} blocking</span><span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">{issues.length} current</span></div>
            <p className="mt-1 text-xs text-muted-foreground">Safe repairs are applied first, validation is regenerated, fixed cards disappear, and remaining cards route to the exact object.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={proactive} onChange={(event) => setProactive(event.target.checked)} />Run safe fixes proactively</label>
            <button disabled={autoFixRunning} onClick={() => void applyFixes(false)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow disabled:opacity-50">{autoFixRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Fix and revalidate</button>
          </div>
        </div>
      </div>

      {autoFixRunning && (
        <div className="border-b border-border bg-primary/5 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {AUTO_FIX_PHASES.map((phase) => {
              const active = autoFixPhase === phase;
              return (
                <span
                  key={phase}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium",
                    active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border",
                  )}
                >
                  {active && <Loader2 className="h-3 w-3 animate-spin" />}
                  {phase}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {autoFixReport && reportCoversCurrent && (
        <div className="border-b border-border p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase",
                  autoFixReport.finalStatus === "Fixed Successfully"
                    ? "bg-emerald-500/15 text-emerald-700"
                    : autoFixReport.finalStatus === "Partially Fixed"
                    ? "bg-amber-500/15 text-amber-700"
                    : "bg-destructive/15 text-destructive",
                )}
              >
                {autoFixReport.finalStatus}
              </span>
              <span className="text-muted-foreground">{autoFixReport.summary}</span>
            </div>
            {autoFixReport.canRollback && (
              <button
                type="button"
                onClick={() => {
                  if (rollbackLastAutoFix()) toast.info("Reverted last Auto-Fix changes.");
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Undo Auto-Fix
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Summary label="Before" value={Math.max(autoFixReport.beforeBlocking, autoFixReport.inputIssueIds?.length || 0)} warning={Math.max(autoFixReport.beforeBlocking, autoFixReport.inputIssueIds?.length || 0) > 0} />
            <Summary label="Fixed safely" value={autoFixReport.fixedCount} good={autoFixReport.fixedCount > 0} />
            <Summary label="Needs review" value={Math.max(autoFixReport.reviewCount, issues.length)} warning={Math.max(autoFixReport.reviewCount, issues.length) > 0} />
            <Summary label="Remaining" value={issues.length} good={issues.length === 0} warning={issues.length > 0} />
          </div>
        </div>
      )}
      {autoFixReport && !reportCoversCurrent && (
        <div className="flex items-center gap-2 border-b border-border bg-sky-500/5 px-4 py-3 text-xs text-sky-700"><RefreshCw className="h-4 w-4" />Workspace changes were detected. The cards below reflect the latest validation state.</div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {filters.map((item) => (
          <button key={item.key} onClick={() => setFilter(item.key)} className={cn("rounded-full border px-3 py-1.5 text-[11px] font-semibold transition", filter === item.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted")}>{item.label}<span className="ml-1.5 opacity-75">{item.count}</span></button>
        ))}
      </div>

      {autoFixReport?.actions.length && reportCoversCurrent ? (
        <details className="border-b border-border p-4">
          <summary className="cursor-pointer text-xs font-semibold">Show automatic repair log ({autoFixReport.actions.length})</summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {autoFixReport.actions.map((action) => <div key={action.id} className={cn("rounded-xl border p-3 text-xs", action.status === "fixed" ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5")}><div className="flex items-center gap-2">{action.status === "fixed" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}<span className="font-semibold">{action.action}</span><span className="ml-auto text-[10px] text-muted-foreground">{action.confidence}%</span></div><div className="mt-1 text-muted-foreground">{action.objectName}: {action.detail}</div></div>)}
          </div>
        </details>
      ) : null}

      <div className="max-h-[620px] space-y-3 overflow-auto p-4">
        {visibleIssues.map((issue) => (
          <article
            key={issue.id}
            role="button"
            tabIndex={0}
            onClick={() => goToFix(issue)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") goToFix(issue); }}
            className={cn("cursor-pointer rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary", severityTone(issue))}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold">{issue.objectName}</span><span className="rounded-full bg-background px-2 py-1 text-[9px] font-semibold uppercase">{issue.area.replace(/-/g, " ")}</span><span className="rounded-full bg-background px-2 py-1 font-mono text-[9px]">{issue.code}</span>{issue.safeAutoFix && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold text-emerald-600">Auto-fixable</span>}</div>
                <p className="mt-2 text-xs text-foreground/90">{issue.message}</p>
                <p className="mt-2 text-xs text-muted-foreground"><strong>Required action:</strong> {issue.recommendation}</p>
                <p className="mt-2 font-mono text-[10px] text-primary"><strong>Exact destination:</strong> {targetPath(issue)}</p>
              </div>
              <button onClick={(event) => { event.stopPropagation(); goToFix(issue); }} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:bg-muted"><MapPin className="h-4 w-4" />{targetLabel(issue)}<ArrowRight className="h-3.5 w-3.5" /></button>
            </div>
          </article>
        ))}
        {!visibleIssues.length && <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No current issues match this filter.</div>}
      </div>
    </section>
  );
}

function Summary({ label, value, good, warning }: { label: string; value: number; good?: boolean; warning?: boolean }) {
  return <div className="rounded-xl border border-border p-3"><div className={cn("text-xl font-bold", good && "text-emerald-600", warning && "text-amber-600")}>{value}</div><div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div></div>;
}
