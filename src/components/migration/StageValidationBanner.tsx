import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, Info, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useMigration } from "@/lib/migration/store";
import { WORKFLOW_STEPS } from "@/lib/migration/workflow-gating";
import { validatePowerBiModel } from "@/lib/migration/model";
import { modelDaxInputs, validateDaxMeasures } from "@/lib/migration/dax";
import { cn } from "@/lib/utils";

export interface StepIssueItem {
  id: string;
  severity: "error" | "action-required" | "warning";
  stepLabel: string;
  target?: string;
  cause: string;
  resolution: string;
  canAutoFix?: boolean;
}

export interface StageValidationBannerProps {
  stepId: number;
  canProceed: boolean;
  blockedReason?: string;
}

export function StageValidationBanner({ stepId, canProceed, blockedReason }: StageValidationBannerProps) {
  const {
    enterpriseFiles,
    enterpriseAnalysis,
    powerBiModel,
    runAutoFix,
    autoFixRunning,
  } = useMigration();
  const [dismissedIds, setDismissedIds] = useState<Record<string, boolean>>({});
  const step = WORKFLOW_STEPS[stepId] || WORKFLOW_STEPS[0];
  const stepLabel = `Step ${step.stepNumber}: ${step.label}`;

  // Requirement 4: Do not show blocking errors before file upload or validation.
  const hasUploadedFiles = enterpriseFiles.length > 0;

  const issues = useMemo<StepIssueItem[]>(() => {
    const items: StepIssueItem[] = [];

    if (stepId === 4 && enterpriseAnalysis) {
      for (const row of enterpriseAnalysis.sourceMappings || []) {
        if (!row.bypassQvd && row.status !== "Mapped") {
          items.push({
            id: `src-${row.table}-${row.originalRef}`,
            severity: "error",
            stepLabel,
            target: `${row.table || "Source"} (${row.originalRef})`,
            cause: `Source reference "${row.originalRef}" is not mapped to an accessible Power BI source (${row.status}).`,
            resolution: "Use Browse in the Source Mapping Editor below to select the source file or configure the connector.",
            canAutoFix: true,
          });
        }
      }
      for (const issue of enterpriseAnalysis.validation?.issues || []) {
        if (issue.category === "source" || issue.category === "mapping") {
          items.push({
            id: `val-${issue.objectName}-${issue.message}`,
            severity: issue.severity === "error" || issue.severity === "blocking" ? "error" : "warning",
            stepLabel,
            target: issue.objectName || undefined,
            cause: issue.message,
            resolution: issue.recommendation || "Update the affected source mapping and re-run analysis.",
            canAutoFix: true,
          });
        }
      }
    }

    if (stepId === 5 && enterpriseAnalysis) {
      for (const diag of enterpriseAnalysis.mQueryDiagnostics || []) {
        if (diag.severity === "blocking-error" || diag.severity === "error" || diag.severity === "warning") {
          items.push({
            id: `m-${diag.table}-${diag.code}-${diag.message}`,
            severity: diag.severity === "warning" ? "warning" : "error",
            stepLabel,
            target: diag.table ? `Table: ${diag.table}` : "Power Query M",
            cause: diag.message,
            resolution: diag.recommendation || "Run Auto-Fix or review the generated Power Query M script.",
            canAutoFix: true,
          });
        }
      }
      items.push({
        id: "action-check-datatypes-5",
        severity: "action-required",
        stepLabel,
        target: "Column Data Types",
        cause: "Check and confirm all column data types (Date, Whole Number, Decimal, Text) in the Data Types table below.",
        resolution: "Review the Data Types section, update any mismatched types, click Save data types if changed, and click Regenerate M Query to prevent Power BI Desktop type errors.",
        canAutoFix: false,
      });
    }

    if (stepId === 6) {
      const validatedModel = powerBiModel ? validatePowerBiModel(powerBiModel) : null;
      const modelInputs = validatedModel ? modelDaxInputs(validatedModel.tables) : [];
      const known = new Set(modelInputs.map((m) => `${m.table.toLowerCase()}::${m.name.toLowerCase()}`));
      const enterpriseInputs = (enterpriseAnalysis?.daxMeasures ?? [])
        .filter((m) => !known.has(`${m.table.toLowerCase()}::${m.measureName.toLowerCase()}`))
        .map((m, i) => ({ id: `enterprise:${i}:${m.measureName}`, name: m.measureName, expression: m.dax, table: m.table }));
      const inputById = new Map([...modelInputs, ...enterpriseInputs].map((m) => [m.id, m]));
      const daxResults = validatedModel ? validateDaxMeasures([...modelInputs, ...enterpriseInputs], validatedModel.tables) : [];
      for (const res of daxResults) {
        const tableName = res.table || inputById.get(res.measureId)?.table;
        for (const issue of res.issues) {
          if (issue.severity === "error") {
            items.push({
              id: `dax-${res.measureId}-${issue.code}`,
              severity: "error",
              stepLabel,
              target: tableName ? `Measure: ${res.measureName} (${tableName})` : `Measure: ${res.measureName}`,
              cause: issue.message,
              resolution: "Click 'Fix all fixable issues' or 'AI Fix' on the measure to repair and revalidate.",
              canAutoFix: true,
            });
          }
        }
      }
    }

    if ((stepId === 7 || stepId === 8) && powerBiModel) {
      const validatedModel = validatePowerBiModel(powerBiModel);
      for (const diag of validatedModel.diagnostics) {
        if (diag.approved) continue;
        const isErr = diag.severity === "blocking-error" || diag.severity === "error";
        items.push({
          id: `model-${diag.id}`,
          severity: isErr ? "error" : "warning",
          stepLabel,
          target: diag.objectName || diag.area,
          cause: diag.message,
          resolution: diag.recommendation || "Resolve the model diagnostic in the editor below before exporting.",
          canAutoFix: isErr,
        });
      }
    }

    if (!canProceed && blockedReason && stepId > 1 && hasUploadedFiles && !items.some((i) => i.severity === "error")) {
      items.unshift({
        id: `gate-${stepId}`,
        severity: "action-required",
        stepLabel,
        cause: blockedReason,
        resolution: "Complete the required action in this step to unlock the next stage.",
        canAutoFix: false,
      });
    }

    return items;
  }, [blockedReason, canProceed, enterpriseAnalysis, hasUploadedFiles, powerBiModel, stepId, stepLabel]);

  const visibleIssues = issues.filter((item) => item.severity !== "warning" || !dismissedIds[item.id]);
  if (!visibleIssues.length) return null;

  const errorCount = visibleIssues.filter((i) => i.severity === "error").length;
  const actionRequiredCount = visibleIssues.filter((i) => i.severity === "action-required").length;
  const warningCount = visibleIssues.filter((i) => i.severity === "warning").length;
  const hasAutoFix = visibleIssues.some((i) => i.canAutoFix) && Boolean(enterpriseAnalysis);

  const handleAutoFix = async () => {
    try {
      const report = await runAutoFix();
      const fixed = report.actions.filter((a) => a.status === "fixed").length;
      const latest = useMigration.getState();
      const latestModel = latest.powerBiModel ? validatePowerBiModel(latest.powerBiModel) : null;
      const latestDaxBlocking = stepId === 6 && latestModel
        ? validateDaxMeasures(modelDaxInputs(latestModel.tables), latestModel.tables).some((r) => r.status !== "valid")
        : false;
      const remainingBlocking = Math.max(report.afterBlocking, latestDaxBlocking ? 1 : 0);

      if (remainingBlocking === 0) {
        toast.success(
          fixed > 0
            ? `Auto-Fix resolved ${fixed} issue(s) — all blocking errors cleared!`
            : "All blocking errors cleared — ready to proceed to the next step.",
        );
      } else if (fixed > 0) {
        toast.warning(`Auto-Fix resolved ${fixed} issue(s)`, {
          description: `${remainingBlocking} blocking item(s) still require review before proceeding.`,
        });
      } else {
        toast.info("Auto-Fix checked all items", {
          description: "Remaining items require a manual decision or file selection.",
        });
      }
    } catch (err) {
      toast.error("Auto-Fix failed", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div
      role="region"
      aria-label="Step validation issues"
      className={cn(
        "rounded-xl border p-4 shadow-xs transition-all",
        errorCount > 0
          ? "border-destructive/35 bg-destructive/5"
          : actionRequiredCount > 0
          ? "action-required-banner border-amber-500/70 bg-amber-500/10"
          : "border-amber-500/35 bg-amber-500/5",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          {errorCount > 0 ? (
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          ) : actionRequiredCount > 0 ? (
            <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-55" />
              <AlertTriangle className="relative h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          )}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-foreground">
              {stepLabel} —{" "}
              {errorCount > 0
                ? `${errorCount} Blocking Error(s)`
                : actionRequiredCount > 0
                ? "Action Required"
                : `${warningCount} Warning(s)`}
            </div>
            <p className="text-xs text-muted-foreground">
              {errorCount > 0
                ? "Resolve blocking errors below before proceeding to the next step."
                : actionRequiredCount > 0
                ? "Complete the required action below to unlock the next step."
                : "Warnings do not block progression and can be dismissed."}
            </p>
          </div>
        </div>
        {hasAutoFix && (
          <button
            type="button"
            onClick={() => void handleAutoFix()}
            disabled={autoFixRunning}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-50"
          >
            {autoFixRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {autoFixRunning ? "Running Auto-Fix…" : "Auto-Fix Issues"}
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {visibleIssues.slice(0, 6).map((issue) => (
          <li
            key={issue.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-xs"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                    issue.severity === "error"
                      ? "bg-destructive/15 text-destructive"
                      : issue.severity === "action-required"
                      ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                  )}
                >
                  {issue.severity === "error"
                    ? "Blocking"
                    : issue.severity === "action-required"
                    ? "Action Required"
                    : "Warning"}
                </span>
                {issue.target && <span className="font-mono font-semibold text-foreground">{issue.target}</span>}
              </div>
              <div className="text-foreground/90">{issue.cause}</div>
              <div className="text-[11px] text-muted-foreground">
                <strong className="text-foreground/80">Action:</strong> {issue.resolution}
              </div>
            </div>
            {issue.severity === "warning" && (
              <button
                type="button"
                onClick={() => setDismissedIds((prev) => ({ ...prev, [issue.id]: true }))}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Dismiss warning"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
        {visibleIssues.length > 6 && (
          <li className="text-[11px] text-muted-foreground px-1">
            + {visibleIssues.length - 6} additional issue(s) shown in the step details below.
          </li>
        )}
      </ul>
    </div>
  );
}
