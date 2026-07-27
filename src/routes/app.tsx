import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { AppHeader } from "@/components/migration/AppHeader";
import { StageNav } from "@/components/migration/StageNav";
import { useMigration } from "@/lib/migration/store";
import { Outlet } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { FloatingWorkflowNav } from "@/components/migration/FloatingWorkflowNav";
import { MigrationAiAssistant } from "@/components/migration/MigrationAiAssistant";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "VTAB Square — Qlik to Power BI Migration" },
      { name: "description", content: "AI-assisted Qlik to Power BI migration." },
    ],
  }),
  component: AuthGuard,
});

function AuthGuard() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) {
      navigate({ to: "/auth" });
    }
  }, [session, loading, navigate]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="h-4 w-4 rounded-full bg-primary animate-pulse" />
      </div>
    );
  }

  return <MigrationLayout />;
}

function MigrationLayout() {
  const { enterpriseAnalysis } = useMigration();
  const router = useRouterState();
  const currentPath = router.location.pathname;
  const isLandingPage = currentPath === "/app" || currentPath === "/app/" || currentPath === "/app/instructions";
  const tableCount = enterpriseAnalysis?.finalTables.length ?? 0;

  return (
    <div className="min-h-screen" id="app-top">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-20">
        {isLandingPage ? (
          <Hero tableCount={tableCount} />
        ) : (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-surface/60 px-4 py-2 text-xs border border-border/60 shadow-xs">
            <div className="flex items-center gap-2 font-medium text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span>Workspace Active</span>
              <span>•</span>
              <span className="text-foreground font-semibold">{tableCount ? `${tableCount} Final Tables` : "Pipeline Ready"}</span>
            </div>
            <a href="#migration-stage-menu" className="text-primary hover:underline font-semibold">Change Stage ↓</a>
          </div>
        )}
        <StageNav />
        <Outlet />
        <FooterSteps />
      </main>
      <FloatingWorkflowNav />
      <MigrationAiAssistant />
    </div>
  );
}

function Hero({ tableCount }: { tableCount: number }) {
  return (
    <section className="mb-6 sm:mb-8 glass-card p-6 sm:p-8 bg-gradient-to-br from-surface/90 via-surface/60 to-primary/5 border border-primary/20 shadow-lg">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div>
          <span className="chip mb-4 text-primary bg-primary/10 border-primary/20">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            AI MIGRATION ENGINE ACTIVE
          </span>
          <h1 className="font-display font-black text-[clamp(2.25rem,5vw,3.75rem)] tracking-tight leading-[1.05] mb-3 break-words">
            <span className="text-foreground">Qlik</span>
            <span className="mx-2 text-muted-foreground font-light">→</span>
            <span className="gradient-text">Power BI</span>
          </h1>
          <p className="text-muted-foreground text-sm max-w-xl leading-relaxed">
            Enterprise-grade automated migration. Upload your Qlik scripts, run the analysis engine, and export a deployment-ready Power BI PBIP project with star-schema modeling and DAX translation.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto">
          <Metric icon="◎" value="100%" label="Conversion accuracy" />
          <Metric icon="⚡" value="10x" label="Faster than manual" />
          <Metric icon="❒" value={tableCount ? `${tableCount}` : "5"} label={tableCount ? "Final tables" : "Core stages"} />
        </div>
      </div>
    </section>
  );
}

function Metric({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="surface-card p-3.5 flex items-center gap-3 bg-surface/80 border border-border/60 shadow-sm hover:border-primary/30 transition-all">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary text-base font-bold">{icon}</div>
      <div className="leading-tight">
        <div className="font-display font-bold text-lg text-foreground">{value}</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function FooterSteps() {
  const steps = [
    { n: "01", k: "CAPTURE", title: "Requirement → Rule Book", body: "Capture business intent and auto-generate a Markdown Rule Book that drives the migration." },
    { n: "02", k: "CONVERT", title: "Script to Power Query M", body: "Source &amp; ETL QVS parsed, then Power Query produced only for surviving tables." },
    { n: "03", k: "DEPLOY", title: "Semantic Model &amp; DAX", body: "Star-schema model auto-built for review, then variables and Set Analysis translated to DAX." },
  ];
  return (
    <section className="grid md:grid-cols-3 gap-3 mt-12">
      {steps.map((s) => (
        <div key={s.n} className="glass-panel p-4 bg-surface/50 hover:bg-surface/80 transition-all border border-border/60">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">{s.n} · {s.k}</span>
            <span className="text-muted-foreground">→</span>
          </div>
          <div className="font-display font-semibold text-sm mb-1 text-foreground" dangerouslySetInnerHTML={{ __html: s.title }} />
          <div className="text-xs text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: s.body }} />
        </div>
      ))}
    </section>
  );
}

