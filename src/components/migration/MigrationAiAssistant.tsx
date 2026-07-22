import { useMemo, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Bot, ChevronLeft, ChevronRight, CircleAlert, Loader2, Send, ShieldCheck, Sparkles, X, Wrench, RotateCcw, CheckCircle2, XCircle } from "lucide-react";
import { useMigration } from "@/lib/migration/store";
import { buildMigrationAgentContext, type MigrationAgentAnswer } from "@/lib/migration/agent/types";
import { sendMigrationAgentMessage } from "@/lib/migration/agent/client";
import { applyCorrectionProposal, createCorrectionProposal, rollbackCorrection } from "@/lib/migration/agent/correction-client";
import { listCorrectionDiagnostics, type AiCorrectionProposal, type CorrectionValidationResult } from "@/lib/migration/agent/correction-engine";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  answer?: MigrationAgentAnswer;
}

const suggestions = [
  "List the final tables",
  "Explain the selected table lineage",
  "List all blocking export issues",
  "Diagnose the current M query error",
  "Show datatype impact",
];

function pageName(pathname: string) {
  const part = pathname.split("/").filter(Boolean).pop() || "analysis";
  return part.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}


function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedQlikLine({ line, tokens }: { line: string; tokens: string[] }) {
  const usable = tokens.filter(Boolean);
  if (!usable.length) return <>{line || " "}</>;
  const expression = new RegExp(`(${usable.map(escapeRegex).join("|")})`, "gi");
  return <>{line.split(expression).map((part, index) => usable.some((token) => token.toLowerCase() === part.toLowerCase())
    ? <mark key={index} className="rounded bg-red-200 px-0.5 text-red-950 ring-1 ring-red-400/70 dark:bg-red-500/35 dark:text-red-50">{part}</mark>
    : <span key={index}>{part}</span>)}</>;
}

export function MigrationAiAssistant() {
  const location = useLocation();
  const { enterpriseAnalysis, projectWorkspace, validationState, repairFocus, setEnterpriseAnalysis } = useMigration();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<AiCorrectionProposal | null>(null);
  const [correctionResult, setCorrectionResult] = useState<CorrectionValidationResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: "I am grounded on the current migration project. I can explain lineage, diagnose M/DAX issues and prepare governed change proposals." },
  ]);

  const selectedTable = useMemo(() => {
    const focus = repairFocus as unknown as { table?: string; objectName?: string } | null;
    return focus?.table || focus?.objectName || enterpriseAnalysis?.finalTables[0]?.table;
  }, [repairFocus, enterpriseAnalysis]);

  const correctionDiagnostics = useMemo(
    () => listCorrectionDiagnostics(enterpriseAnalysis, selectedTable).slice(0, 8),
    [enterpriseAnalysis, selectedTable],
  );

  function diagnoseAndPropose(diagnosticId: string) {
    if (!enterpriseAnalysis) return;
    setCorrectionResult(null);
    setProposal(createCorrectionProposal({
      analysis: enterpriseAnalysis,
      diagnosticId,
      projectId: projectWorkspace?.id || "local-project",
      projectVersion: String(validationState.workspaceRevision),
    }));
  }

  async function applyProposal() {
    if (!enterpriseAnalysis || !proposal || applying) return;
    setApplying(true);
    try {
      const result = applyCorrectionProposal(enterpriseAnalysis, proposal);
      setEnterpriseAnalysis(result.analysis);
      setCorrectionResult(result.validation);
      setProposal({ ...proposal, status: result.validation.status });
    } finally {
      setApplying(false);
    }
  }

  function doRollback() {
    if (!proposal) return;
    const result = rollbackCorrection(proposal.proposalId);
    if (result.analysis) setEnterpriseAnalysis(result.analysis);
    setCorrectionResult(result.validation);
  }

  async function submit(value = input) {
    const question = value.trim();
    if (!question || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: question }]);
    setLoading(true);
    try {
      const context = buildMigrationAgentContext({
        question,
        currentPage: pageName(location.pathname),
        selectedTable,
        projectName: projectWorkspace?.name,
        projectId: projectWorkspace?.id,
        projectVersion: validationState.workspaceRevision,
        analysis: enterpriseAnalysis,
      });
      const answer = await sendMigrationAgentMessage({ message: question, context });
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", text: answer.answer, answer }]);
    } catch (error) {
      setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "assistant", text: error instanceof Error ? error.message : "The assistant could not complete this request." }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-[4.5rem] z-50 flex items-center gap-2 rounded-full sm:bottom-20 bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-2xl hover:opacity-95"
      >
        <Sparkles className="h-4 w-4" /> Migration AI <ChevronLeft className="h-4 w-4" />
      </button>
    );
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-full flex-col sm:max-w-[95vw] border-l border-border bg-background shadow-2xl">
      <div className="border-b border-border bg-surface-elevated p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-display text-lg font-bold"><Bot className="h-5 w-5 text-primary" /> Migration AI Assistant</div>
            <div className="mt-1 text-xs text-muted-foreground">{projectWorkspace?.name || "No project loaded"} · {pageName(location.pathname)}</div>
          </div>
          <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-muted" aria-label="Close assistant"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-lg border border-border p-2"><div className="font-semibold">Table</div><div className="truncate text-muted-foreground">{selectedTable || "None"}</div></div>
          <div className="rounded-lg border border-border p-2"><div className="font-semibold">Blockers</div><div className="text-muted-foreground">{enterpriseAnalysis?.validation.errorCount ?? 0}</div></div>
          <div className="rounded-lg border border-border p-2"><div className="font-semibold">Version</div><div className="text-muted-foreground">{validationState.workspaceRevision}</div></div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!enterpriseAnalysis && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm"><CircleAlert className="mr-2 inline h-4 w-4" />Upload and analyze a Qlik project to ground the assistant.</div>
        )}
        {correctionDiagnostics.length > 0 && (
          <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold"><Wrench className="h-4 w-4" /> Error correction</div>
              <span className="rounded-full bg-background px-2 py-0.5 text-[10px]">{correctionDiagnostics.length} issue(s)</span>
            </div>
            <div className="space-y-2">
              {correctionDiagnostics.slice(0, 3).map((d) => (
                <div key={d.id} className="rounded-lg border border-border bg-background p-2 text-xs">
                  <div className="font-semibold">{d.code}</div>
                  <div className="mt-1 text-muted-foreground">{d.message}</div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => submit(`Explain error: ${d.message}`)} className="rounded-md border border-border px-2 py-1 hover:bg-muted">Explain Error</button>
                    <button onClick={() => diagnoseAndPropose(d.id)} className="rounded-md bg-primary px-2 py-1 font-semibold text-primary-foreground hover:opacity-90">Fix with AI</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {proposal && (
          <section className="rounded-xl border border-primary/35 bg-primary/5 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">AI Correction Proposal</div>
              <span className="rounded-full border border-border bg-background px-2 py-0.5">{proposal.status}</span>
            </div>
            <div className="mt-2 space-y-2">
              <div><strong>Finding:</strong> {proposal.finding}</div>
              <div><strong>Root cause:</strong> {proposal.rootCause}</div>
              <div><strong>Affected:</strong> {proposal.affectedObjects.join(", ")}</div>
              <div><strong>Risk:</strong> {proposal.riskLevel} · <strong>Confidence:</strong> {proposal.confidence}%</div>
              {proposal.qlikScriptEvidence?.length > 0 && (
                <details open className="rounded-lg border border-red-500/30 bg-background">
                  <summary className="cursor-pointer px-2 py-2 font-semibold text-red-700 dark:text-red-300">Original Qlik load-script evidence · {proposal.qlikScriptEvidence.length} statement(s)</summary>
                  <div className="space-y-2 border-t border-border p-2">
                    {proposal.qlikScriptEvidence.map((evidence) => (
                      <div key={evidence.evidenceId} className="overflow-hidden rounded-lg border border-border">
                        <div className="bg-muted/50 px-2 py-1.5">
                          <div className="font-semibold">{evidence.file} · lines {evidence.startLine}-{evidence.endLine}</div>
                          <div className="text-[10px] text-muted-foreground">{evidence.operationType} · {evidence.reason}</div>
                        </div>
                        <div className="max-h-56 overflow-auto font-mono text-[10px] leading-5">
                          {evidence.lines.map((line, index) => {
                            const lineNumber = evidence.excerptStartLine + index;
                            const highlighted = evidence.highlightedLines.includes(lineNumber);
                            return (
                              <div key={lineNumber} className={`grid min-w-max grid-cols-[3rem_1fr] border-t border-border/20 ${highlighted ? "bg-red-200/45 shadow-[inset_4px_0_0_rgb(239,68,68)] dark:bg-red-950/35" : ""}`}>
                                <span className={`select-none border-r border-border/40 px-2 text-right ${highlighted ? "font-bold text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>{lineNumber}</span>
                                <code className="whitespace-pre px-2"><HighlightedQlikLine line={line} tokens={evidence.tokens} /></code>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {proposal.originalCode && proposal.correctedCode !== proposal.originalCode && (
                <div className="grid gap-2">
                  <details><summary className="cursor-pointer font-semibold">Current code</summary><pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap rounded bg-background p-2">{proposal.originalCode}</pre></details>
                  <details open><summary className="cursor-pointer font-semibold">Corrected code</summary><pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap rounded bg-background p-2">{proposal.correctedCode}</pre></details>
                </div>
              )}
              {proposal.patchOperations.length > 0 && (
                <div className="space-y-2">
                  <div className="font-semibold">Smallest safe patch</div>
                  {proposal.patchOperations.map((operation, index) => (
                    <div key={`${operation.kind}-${index}`} className="rounded-lg border border-border bg-background p-2">
                      <div><strong>{operation.kind}</strong> · {operation.description}</div>
                      {operation.queryName && <div className="mt-1 text-muted-foreground">Generated query: {operation.queryName}</div>}
                      {operation.code && (
                        <details open className="mt-1">
                          <summary className="cursor-pointer font-semibold">Generated M dependency</summary>
                          <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2">{operation.code}</pre>
                        </details>
                      )}
                      {operation.search && operation.replacement && operation.search !== proposal.originalCode && (
                        <div className="mt-1 grid gap-1">
                          <div><strong>Replace:</strong> <code>{operation.search}</code></div>
                          <div><strong>With:</strong> <code>{operation.replacement}</code></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div><strong>Validation plan:</strong> {proposal.requiredValidations.join(", ")}</div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={applyProposal} disabled={applying || proposal.status !== "Awaiting Approval"} className="rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-40">{applying ? "Applying…" : "Apply AI Fix"}</button>
                <button onClick={() => setProposal(null)} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Reject</button>
                {correctionResult && <button onClick={doRollback} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 hover:bg-muted"><RotateCcw className="h-3 w-3" /> Rollback</button>}
              </div>
            </div>
          </section>
        )}

        {correctionResult && (
          <section className="rounded-xl border border-border bg-card p-3 text-xs">
            <div className="font-semibold">Correction validation · {correctionResult.status}</div>
            {correctionResult.passed.map((v) => <div key={v} className="mt-1 flex gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{v}</div>)}
            {correctionResult.failed.map((v) => <div key={v} className="mt-1 flex gap-1 text-destructive"><XCircle className="h-3.5 w-3.5 shrink-0" />{v}</div>)}
            {correctionResult.pending.map((v) => <div key={v} className="mt-1 flex gap-1 text-muted-foreground"><CircleAlert className="h-3.5 w-3.5 shrink-0" />{v}</div>)}
          </section>
        )}

        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "ml-10 rounded-2xl bg-primary p-3 text-sm text-primary-foreground" : "mr-3 rounded-2xl border border-border bg-card p-3 text-sm"}>
            <div className="whitespace-pre-wrap leading-relaxed">{message.text}</div>
            {message.answer && (
              <div className="mt-3 space-y-2 border-t border-border pt-3 text-xs">
                <div><strong>Evidence:</strong> {message.answer.evidence.slice(0, 3).join(" · ") || "No additional evidence"}</div>
                <div><strong>Impact:</strong> {message.answer.impact}</div>
                <div><strong>Validation:</strong> {message.answer.validationRequired.join(", ")}</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-1"><ShieldCheck className="h-3 w-3" /> {message.answer.confidence}</span>
                  <span className="text-muted-foreground">{message.answer.provider === "openai" ? "AI + project evidence" : "Deterministic project evidence"}</span>
                </div>
                {message.answer.proposal && (
                  <div className="rounded-lg border border-warning/40 bg-warning/10 p-2">
                    <div className="font-semibold">Governed proposal created</div>
                    <div className="mt-1">Risk: {message.answer.proposal.riskLevel}. Review before applying. This assistant does not bypass validation.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="mr-3 flex items-center gap-2 rounded-2xl border border-border bg-card p-3 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Analyzing project evidence…</div>}
      </div>

      <div className="border-t border-border p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestions.slice(0, 3).map((suggestion) => (
            <button key={suggestion} onClick={() => submit(suggestion)} className="rounded-full border border-border px-2.5 py-1 text-[11px] hover:bg-muted">{suggestion}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }}
            placeholder="Ask about lineage, M, DAX, datatype impact or blockers…"
            className="min-h-20 flex-1 resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button onClick={() => submit()} disabled={!input.trim() || loading} className="self-end rounded-xl bg-primary p-3 text-primary-foreground disabled:opacity-40" aria-label="Send"><Send className="h-4 w-4" /></button>
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground">AI-generated ≠ validated. Approved changes must be regenerated and checked by deterministic validators.</div>
      </div>
      <button onClick={() => setOpen(false)} className="absolute -left-9 top-1/2 rounded-l-lg border border-r-0 border-border bg-background p-2 shadow"><ChevronRight className="h-4 w-4" /></button>
    </aside>
  );
}
