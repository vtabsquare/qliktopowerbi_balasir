// EnterprisePowerQueryPage - used in /app/power-query dedicated route
import { useMemo, useState } from "react";
import { applyDataTypeOverrides, type EnterpriseAnalysis } from "@/lib/migration/enterprise-parser";
import { DEFAULT_CALENDAR_OVERRIDE, type CalendarOverrideConfig, type CalendarCreationMode } from "@/lib/migration/calendar-override";
import { toast } from "sonner";
import { TabMQueryDataTypes, TabFinalTables } from "./EnterpriseAnalysisPanel";

interface Props {
  analysis: EnterpriseAnalysis;
  columnTypeEdits: Record<string, string>;
  onTypeChange: (key: string, val: string) => void;
  onAnalysisUpdate: (analysis: EnterpriseAnalysis) => void;
}


function CalendarBuilder({ analysis, onAnalysisUpdate }: { analysis: EnterpriseAnalysis; onAnalysisUpdate: (analysis: EnterpriseAnalysis) => void }) {
  const initial = analysis.calendarOverride || DEFAULT_CALENDAR_OVERRIDE;
  const [config, setConfig] = useState<CalendarOverrideConfig>({ ...initial });

  const finalTables = useMemo(() => analysis.finalTables.filter((table) => table.table !== config.calendarTableName), [analysis.finalTables, config.calendarTableName]);
  const sourceTable = finalTables.some((table) => table.table === config.sourceTable) ? config.sourceTable : finalTables[0]?.table || "";
  const sourceFields = sourceTable ? (analysis.profiles[sourceTable]?.fields || []) : [];
  const dateFields = sourceFields.filter((field) => {
    const type = analysis.columnTypes?.[sourceTable]?.[field] || "";
    return /date|time/i.test(type) || /date|day|month|year/i.test(field);
  });
  const sourceColumn = dateFields.includes(config.sourceColumn || "") ? config.sourceColumn : dateFields[0] || sourceFields[0] || "";

  const update = <K extends keyof CalendarOverrideConfig>(key: K, value: CalendarOverrideConfig[K]) => setConfig((current) => ({ ...current, [key]: value }));

  const apply = () => {
    const normalized: CalendarOverrideConfig = {
      ...config,
      calendarTableName: config.calendarTableName?.trim() || "MasterCalendar",
      sourceTable: config.mode === "final-table" ? sourceTable : undefined,
      sourceColumn: config.mode === "final-table" ? sourceColumn : undefined,
      fiscalStartMonth: Math.min(12, Math.max(1, Number(config.fiscalStartMonth || 1))),
    };
    if (normalized.mode === "final-table" && (!normalized.sourceTable || !normalized.sourceColumn)) {
      toast.error("Choose a final table and date column for the calendar.");
      return;
    }
    if (normalized.mode === "fixed-range" && (!normalized.startDate || !normalized.endDate)) {
      toast.error("Enter both calendar start and end dates.");
      return;
    }
    const currentTypes: Record<string, string> = {};
    for (const [table, fields] of Object.entries(analysis.columnTypes || {})) {
      for (const [field, type] of Object.entries(fields || {})) currentTypes[`${table}.${field}`] = type;
    }
    const updated = applyDataTypeOverrides({ ...analysis, calendarOverride: normalized }, currentTypes);
    onAnalysisUpdate(updated);
    setConfig(normalized);
    toast.success(normalized.mode === "qlik" ? "Original Qlik calendar restored" : normalized.mode === "disabled" ? "Calendar generation disabled" : "Calendar Power Query generated", {
      description: normalized.mode === "final-table" ? `${normalized.sourceTable}.${normalized.sourceColumn} drives ${normalized.calendarTableName}.` : normalized.mode === "fixed-range" ? `${normalized.startDate} to ${normalized.endDate}.` : undefined,
    });
  };

  const modes: Array<{ value: CalendarCreationMode; label: string; description: string }> = [
    { value: "qlik", label: "Use Qlik logic", description: "Keep the calendar generated from the uploaded Qlik execution plan." },
    { value: "final-table", label: "Use final table", description: "Create a continuous calendar from a selected final table and date column." },
    { value: "fixed-range", label: "Use start and end dates", description: "Create a continuous calendar from a manually supplied date range." },
    { value: "disabled", label: "Do not create calendar", description: "Remove this calendar from the generated Power BI model." },
  ];

  return (
    <div className="surface-card p-4 border border-sky-500/20">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="font-display font-semibold text-lg">Calendar Builder</h3>
          <p className="text-sm text-muted-foreground">Choose how the Power Query editor should create the calendar. This override affects preview, regeneration, validation and PBIP export through the same analysis object.</p>
        </div>
        <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-600">Current: {analysis.calendarOverride?.mode || "qlik"}</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {modes.map((mode) => (
          <button key={mode.value} type="button" onClick={() => update("mode", mode.value)} className={`rounded-xl border p-3 text-left transition ${config.mode === mode.value ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:bg-muted/30"}`}>
            <div className="text-sm font-semibold">{mode.label}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{mode.description}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-medium">Calendar table name
          <input value={config.calendarTableName || ""} onChange={(event) => update("calendarTableName", event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </label>
        {config.mode === "final-table" && <>
          <label className="text-xs font-medium">Final table
            <select value={sourceTable} onChange={(event) => setConfig((current) => ({ ...current, sourceTable: event.target.value, sourceColumn: undefined }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              {finalTables.map((table) => <option key={table.table} value={table.table}>{table.table}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium">Date column
            <select value={sourceColumn} onChange={(event) => update("sourceColumn", event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              {(dateFields.length ? dateFields : sourceFields).map((field) => <option key={field} value={field}>{field} · {analysis.columnTypes?.[sourceTable]?.[field] || "Detected"}</option>)}
            </select>
          </label>
        </>}
        {config.mode === "fixed-range" && <>
          <label className="text-xs font-medium">Start date
            <input type="date" value={config.startDate || ""} onChange={(event) => update("startDate", event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-medium">End date
            <input type="date" value={config.endDate || ""} onChange={(event) => update("endDate", event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </label>
        </>}
        {(config.mode === "final-table" || config.mode === "fixed-range") && <label className="text-xs font-medium">Fiscal year start month
          <select value={config.fiscalStartMonth || 1} onChange={(event) => update("fiscalStartMonth", Number(event.target.value))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
          </select>
        </label>}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/30 p-3">
        <div className="text-xs text-muted-foreground">
          {config.mode === "final-table" && <>Planned source: <strong className="text-foreground">{sourceTable || "—"}.{sourceColumn || "—"}</strong></>}
          {config.mode === "fixed-range" && <>Planned range: <strong className="text-foreground">{config.startDate || "—"} → {config.endDate || "—"}</strong></>}
          {config.mode === "qlik" && <>The uploaded Qlik calendar remains authoritative.</>}
          {config.mode === "disabled" && <>The selected calendar query and its relationships will be removed.</>}
        </div>
        <button type="button" onClick={apply} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:opacity-90">Apply and regenerate Power Query</button>
      </div>
    </div>
  );
}

function ReconstructionPlan({ analysis }: { analysis: EnterpriseAnalysis }) {
  const plan = analysis.reconstruction;
  if (!plan) return null;
  const finalTables = Object.values(plan.tables).filter((table) => table.includeInModel && table.table !== "Qlik Variables");
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border p-3"><div className="text-xs text-muted-foreground">Analysis status</div><div className="mt-1 text-xl font-bold">{plan.stable ? "Stable" : "Review"}</div><div className="text-[10px] text-muted-foreground">{plan.confidence}% confidence</div></div>
        <div className="rounded-xl border border-border p-3"><div className="text-xs text-muted-foreground">Final model tables</div><div className="mt-1 text-xl font-bold">{finalTables.length}</div><div className="text-[10px] text-muted-foreground">Unwanted helpers excluded</div></div>
        <div className="rounded-xl border border-border p-3"><div className="text-xs text-muted-foreground">Aggregations moved to DAX</div><div className="mt-1 text-xl font-bold">{plan.aggregateMeasures.length}</div><div className="text-[10px] text-muted-foreground">Row grain retained in M</div></div>
        <div className="rounded-xl border border-border p-3"><div className="text-xs text-muted-foreground">Composite keys</div><div className="mt-1 text-xl font-bold">{plan.compositeKeys.length}</div><div className="text-[10px] text-muted-foreground">Multi-column Qlik associations</div></div>
      </div>

      <div>
        <h4 className="text-sm font-semibold">Steady reconstruction passes</h4>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {plan.passes.map((pass) => (
            <div key={pass.id} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold">{pass.name}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pass.status === "passed" ? "bg-emerald-500/10 text-emerald-600" : pass.status === "warning" ? "bg-amber-500/10 text-amber-600" : "bg-red-500/10 text-red-600"}`}>{pass.status}</span></div>
              <p className="mt-1 text-[11px] text-muted-foreground">{pass.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold">Consolidated Qlik load script by final table</h4>
        <p className="mt-1 text-xs text-muted-foreground">Each section contains the complete backtracked sequence that contributes to the selected Power BI table.</p>
        <div className="mt-3 space-y-2">
          {finalTables.map((table) => (
            <details key={table.table} className="rounded-xl border border-border bg-background">
              <summary className="cursor-pointer list-none p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><div className="text-sm font-semibold">{table.table}</div><div className="mt-1 text-[10px] text-muted-foreground">{table.operationIds.length} operations · {table.sourceRefs.length} sources · {table.confidence}% confidence</div></div>
                  <div className="flex flex-wrap gap-1.5">{table.aggregationMeasures.length > 0 && <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[10px] text-violet-600">{table.aggregationMeasures.length} DAX aggregation(s)</span>}{table.compositeKeys.length > 0 && <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[10px] text-sky-600">{table.compositeKeys.length} composite key(s)</span>}{table.droppedDependencies.length > 0 && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] text-amber-600">{table.droppedDependencies.length} retained staging</span>}</div>
                </div>
              </summary>
              <div className="border-t border-border p-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2"><div><div className="text-[10px] font-semibold uppercase text-muted-foreground">Sources and dependencies</div><p className="mt-1 text-xs">{[...table.sourceRefs, ...table.dependencies].join(", ") || "No external dependency"}</p></div><div><div className="text-[10px] font-semibold uppercase text-muted-foreground">Power BI decision</div><p className="mt-1 text-xs">{table.reason}</p></div></div>
                {table.aggregationMeasures.length > 0 && <div><div className="text-[10px] font-semibold uppercase text-muted-foreground">Aggregations created as DAX</div><p className="mt-1 text-xs">{table.aggregationMeasures.join(", ")}</p></div>}
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 font-mono text-[11px] text-slate-100">{table.fullLoadScript || "No script text was available."}</pre>
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border p-4"><h4 className="text-sm font-semibold">Static INLINE and Mapping tables</h4><div className="mt-3 space-y-2">{plan.staticTables.length ? plan.staticTables.map((table) => <div key={table.signature} className="rounded-lg bg-muted/30 p-3"><div className="flex justify-between gap-3"><span className="text-xs font-semibold">{table.canonicalName}</span><span className="text-[10px] text-muted-foreground">{table.materialize ? "Static M query" : "Unused / omitted"}</span></div><p className="mt-1 text-[10px] text-muted-foreground">Aliases: {table.aliases.join(", ")}. {table.reason}</p></div>) : <p className="text-xs text-muted-foreground">No INLINE definitions detected.</p>}</div></div>
        <div className="rounded-xl border border-border p-4"><h4 className="text-sm font-semibold">Dropped tables and QVD persistence</h4><div className="mt-3 space-y-2"><p className="text-xs text-muted-foreground">{plan.retainedDroppedTables.length} dropped table(s) retained as load-disabled staging queries.</p><p className="text-xs text-muted-foreground">{plan.omittedStoreOperationIds.length} STORE QVD operation(s) omitted while upstream lineage is connected directly.</p></div></div>
      </div>
    </div>
  );
}

function ExecutionPlanReview({ analysis }: { analysis: EnterpriseAnalysis }) {
  const plans = Object.values(analysis.executionPlans || {}).filter((plan) => plan.tableName !== "Qlik Variables");
  if (!plans.length) return null;
  return (
    <div className="surface-card p-4">
      <h3 className="font-display font-semibold text-lg text-foreground mb-1">Table execution plans</h3>
      <p className="text-sm text-muted-foreground mb-4">One authoritative plan drives the ten-row preview, Power Query M, final model columns, validation, and PBIP export. Every visible generated step returns a table.</p>
      <div className="space-y-3">
        {plans.map((plan) => (
          <details key={plan.tableName} className="rounded-xl border border-border bg-background">
            <summary className="cursor-pointer list-none p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{plan.tableName}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{plan.sourceQuery || plan.sourceReference || plan.sourceTable} · {plan.steps.length} table-producing steps · {plan.finalColumns.length} final columns</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[10px] text-sky-600">{plan.joins.length} join(s)</span>
                  <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[10px] text-violet-600">{plan.calculations.length} calculation(s)</span>
                  {plan.warnings.length > 0 && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] text-amber-600">{plan.warnings.length} warning(s)</span>}
                </div>
              </div>
            </summary>
            <div className="border-t border-border p-4 space-y-4">
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface-elevated"><tr><th className="p-2 text-left w-12">#</th><th className="p-2 text-left">Visible step</th><th className="p-2 text-left">Purpose</th><th className="p-2 text-left">Returns</th></tr></thead>
                  <tbody>{plan.steps.map((step) => <tr key={step.id} className="border-t border-border"><td className="p-2 text-muted-foreground">{step.order}</td><td className="p-2 font-mono font-semibold">{step.name}</td><td className="p-2 text-muted-foreground">{step.description}</td><td className="p-2"><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-600">table</span></td></tr>)}</tbody>
                </table>
              </div>
              {plan.joins.length > 0 && <div><div className="text-[10px] font-semibold uppercase text-muted-foreground">Join payload</div><div className="mt-2 space-y-2">{plan.joins.map((join) => <div key={join.operationId} className="rounded-lg bg-muted/30 p-3 text-xs"><div className="font-semibold">{join.joinKind} join {join.sourceTable}</div><div className="mt-1 text-muted-foreground">Keys: {join.leftKeys.join(" + ")} → {join.rightKeys.join(" + ")}. Added fields: {join.outputColumns.join(", ") || "none"}.</div></div>)}</div></div>}
              <div><div className="text-[10px] font-semibold uppercase text-muted-foreground">Final model columns</div><p className="mt-1 text-xs">{plan.finalColumns.join(", ")}</p></div>
              {plan.warnings.length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700">{plan.warnings.join(" ")}</div>}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

export function EnterprisePowerQueryPage({ analysis, columnTypeEdits, onTypeChange, onAnalysisUpdate }: Props) {
  return (
    <div className="space-y-6">
      <CalendarBuilder analysis={analysis} onAnalysisUpdate={onAnalysisUpdate} />
      <div className="surface-card p-4">
        <h3 className="font-display font-semibold text-lg text-foreground mb-1">AI-assisted consolidated load reconstruction</h3>
        <p className="text-sm text-muted-foreground mb-4">The backend completes multiple deterministic passes before Power Query or DAX is produced: parse, lineage backtracking, static-table consolidation, aggregation separation, key construction and model optimization.</p>
        <ReconstructionPlan analysis={analysis} />
      </div>
      <ExecutionPlanReview analysis={analysis} />
      <div className="surface-card p-4">
        <h3 className="font-display font-semibold text-lg text-foreground mb-1">Final Tables Overview</h3>
        <p className="text-sm text-muted-foreground mb-4">Review each final table's columns, lineage, and data types before generating M Query code.</p>
        <TabFinalTables analysis={analysis} />
      </div>
      <div className="surface-card p-4">
        <h3 className="font-display font-semibold text-lg text-foreground mb-1">Qlik Logic Decisions</h3>
        <p className="text-sm text-muted-foreground mb-4">The migration engine classifies Qlik-only runtime, formatting, persistence and security constructs before writing Power Query.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {(["translate", "preserve-metadata", "ignore-runtime", "manual-review"] as const).map((action) => (
            <div key={action} className="rounded-xl border border-border p-3 bg-surface-elevated/40">
              <div className="text-xs text-muted-foreground capitalize">{action.replace("-", " ")}</div>
              <div className="text-xl font-bold">{analysis.logicDecisions?.filter((item) => item.action === action).length || 0}</div>
            </div>
          ))}
        </div>
        <div className="max-h-64 overflow-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-elevated"><tr><th className="p-2 text-left">Construct</th><th className="p-2 text-left">Decision</th><th className="p-2 text-left">Power BI handling</th></tr></thead>
            <tbody>{(analysis.logicDecisions || []).map((item) => <tr key={item.id} className="border-t border-border"><td className="p-2 max-w-[320px] truncate" title={item.qlikConstruct}>{item.category}: {item.qlikConstruct}</td><td className="p-2 capitalize">{item.action.replace("-", " ")}</td><td className="p-2 text-muted-foreground">{item.handling}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="surface-card p-4">
        <h3 className="font-display font-semibold text-lg text-foreground mb-1">M Query Generation &amp; Data Types</h3>
        <p className="text-sm text-muted-foreground mb-4">Edit Power BI data types, save, then generate optimized M Query code for each table.</p>
        <TabMQueryDataTypes
          analysis={analysis}
          columnTypeEdits={columnTypeEdits}
          onTypeChange={onTypeChange}
          onAnalysisUpdate={onAnalysisUpdate}
        />
      </div>
    </div>
  );
}
