import { useState } from "react";
import { ArrowUp, Check, X, Layers, Sparkles } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { STAGES } from "./StageNav";
import { useMigration } from "@/lib/migration/store";

export function FloatingWorkflowNav() {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { enterpriseFiles, enterpriseAnalysis, qvwAnalysis, expressionInventory, powerBiModel } = useMigration();
  const ready = (stagePath: string) => {
    if (["/app/instructions", "/app"].includes(stagePath)) return true;
    if (stagePath === "/app/qvw-analysis") return enterpriseFiles.length > 0;
    if (stagePath === "/app/expression-conversion") return Boolean(qvwAnalysis || enterpriseAnalysis);
    if (stagePath === "/app/analysis") return enterpriseFiles.length > 0;
    if (["/app/power-query", "/app/dax-measures"].includes(stagePath)) return Boolean(enterpriseAnalysis);
    if (["/app/powerbi-model", "/app/relationships", "/app/semantic-model"].includes(stagePath)) return Boolean(powerBiModel || enterpriseAnalysis);
    return true;
  };
  return <>
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 sm:bottom-6 sm:right-6">
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="h-10 sm:h-11 px-3.5 sm:px-4 rounded-full border border-border/80 bg-background/80 backdrop-blur-xl shadow-elevated flex items-center gap-2 text-xs font-semibold hover:bg-surface hover:border-primary/40 transition-all group"
        title="Go to top"
      >
        <ArrowUp className="h-3.5 w-3.5 text-primary group-hover:-translate-y-0.5 transition-transform" />
        <span>Top</span>
      </button>
      <button
        onClick={() => setOpen((value) => !value)}
        className="h-10 sm:h-11 px-4 sm:px-5 rounded-full bg-gradient-to-r from-primary to-[oklch(0.62_0.2_260)] text-primary-foreground shadow-elevated flex items-center gap-2 text-xs font-bold hover:scale-105 active:scale-95 transition-all"
        title="Go to migration menu"
      >
        {open ? <X className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
        <span>Quick Jump</span>
      </button>
    </div>
    {open && (
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setOpen(false)}>
        <aside
          className="absolute right-4 bottom-20 w-[min(360px,calc(100vw-2rem))] max-h-[75vh] overflow-auto glass-card bg-surface/90 shadow-2xl p-5 border border-border/80 animate-in slide-in-from-bottom-4 duration-200"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-3">
            <div>
              <div className="font-display font-bold text-base text-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Migration Navigator</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Instant access to all 11 stages</p>
            </div>
            <button onClick={() => setOpen(false)} className="h-7 w-7 rounded-lg hover:bg-muted grid place-items-center text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1">
            {STAGES.map((stage, index) => {
              const available = ready(stage.path);
              const active = path === stage.path || (path === "/app/" && stage.path === "/app");
              return available ? (
                <Link
                  key={stage.id}
                  to={stage.path}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${active ? "bg-primary text-primary-foreground shadow-sm scale-[1.01]" : "hover:bg-muted/80 text-foreground"}`}
                >
                  <span className={`grid h-6 w-6 place-items-center rounded-lg text-[10px] ${active ? "bg-white/20" : "bg-muted text-muted-foreground"}`}>
                    {active ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <span className="truncate">{stage.label}</span>
                  {active && <span className="ml-auto text-[10px] bg-white/20 px-1.5 py-0.5 rounded">Active</span>}
                </Link>
              ) : (
                <div key={stage.id} className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs text-muted-foreground opacity-50">
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-muted text-[10px]">{index + 1}</span>
                  <span className="truncate">{stage.label}</span>
                  <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">locked</span>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    )}
  </>;
}
