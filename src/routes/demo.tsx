import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseDemo } from "@/lib/supabase";
import { useMigration } from "@/lib/migration/store";
import { toast } from "sonner";
import {
  Sparkles,
  Lock,
  Mail,
  KeyRound,
  ArrowRight,
  LogOut,
  Layers,
  Compass,
  Check,
  CheckCircle2,
  FileCode2,
  Database,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import {
  WORKFLOW_STEPS,
  isStepCompleted,
  isStepUnlocked,
  getFirstIncompleteStep,
  getCompletedSteps,
  markStepCompleted,
  WorkflowStep,
} from "@/lib/migration/workflow-gating";
import { useNavigationLoading } from "@/components/common/NavigationLoadingOverlay";
import { TourProvider } from "@/contexts/TourContext";
import { TourGuideOverlay } from "@/components/tour/TourGuideOverlay";
import { DemoEndedModal } from "@/components/migration/DemoEndedModal";
import { FloatingWorkflowNav } from "@/components/migration/FloatingWorkflowNav";

// Step Component Views
import { InstructionsPage } from "@/routes/app/instructions";
import { UploadPage } from "@/routes/app/index";
import { QvwAnalysisPage } from "@/routes/app/qvw-analysis";
import { ExpressionConversionPage } from "@/routes/app/expression-conversion";
import { AnalysisPage } from "@/routes/app/analysis";
import { PowerQueryPage } from "@/routes/app/power-query";
import { DaxMeasuresPage } from "@/routes/app/dax-measures";
import { SemanticModelPage } from "@/routes/app/semantic-model";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Qlik to Power BI – Demo Version" },
      { name: "description", content: "Dedicated Demo Environment for Qlik to Power BI Migration Engine." },
    ],
  }),
  component: DemoPageRoot,
});

function DemoPageRoot() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Initialize and listen to dedicated Demo session in supabaseDemo
  useEffect(() => {
    if (!supabaseDemo) {
      setLoading(false);
      return;
    }

    supabaseDemo.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabaseDemo.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <span className="text-xs text-muted-foreground font-medium">Loading Demo Environment…</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return <DemoLoginPortal onLoggedIn={(sess) => setSession(sess)} />;
  }

  return <DemoWorkspace session={session} onLoggedOut={() => setSession(null)} />;
}

// ─── 1. Dedicated Demo Login Portal ──────────────────────────────────────────
function DemoLoginPortal({ onLoggedIn }: { onLoggedIn: (session: any) => void }) {
  const [email, setEmail] = useState("vtabpublicuser@gmail.com");
  const [password, setPassword] = useState("Demo@12345");
  const [signingIn, setSigningIn] = useState(false);
  const { withLoading } = useNavigationLoading();

  const handleDemoSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSigningIn(true);

    await withLoading(
      async () => {
        try {
          if (!supabaseDemo) {
            toast.error("Demo Supabase client is not configured.");
            return;
          }

          // 1. Authenticate against isolated demo client
          const { data, error } = await supabaseDemo.auth.signInWithPassword({
            email: email.trim(),
            password: password,
          });

          if (error) {
            // Fallback: try generating magic link via demo login endpoint
            const res = await fetch("/api/auth/demo-login", { method: "POST" });
            const body = await res.json();
            if (body.magicLink) {
              window.location.href = body.magicLink;
              return;
            }
            throw error;
          }

          if (data.session) {
            toast.success("Welcome to Qlik to Power BI Demo Version!");
            onLoggedIn(data.session);
          }
        } catch (err: any) {
          toast.error(err.message || "Failed to enter demo mode. Please verify credentials.");
        } finally {
          setSigningIn(false);
        }
      },
      { message: "Entering Demo Environment...", subMessage: "Authenticating vtabpublicuser@gmail.com..." },
    );
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-gradient-to-br from-background via-surface/40 to-primary/5">
      <div className="w-full max-w-md surface-card p-8 sm:p-10 border border-primary/30 shadow-2xl rounded-3xl relative overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center text-center mb-8">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.62_0.2_260)] text-primary-foreground font-bold grid place-items-center shadow-lg mb-3">
            <span className="text-base tracking-tight">VT</span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Dedicated Demo URL</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">Demo Version Portal</h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Experience the step-by-step Qlik to Power BI AI migration pipeline with sample enterprise datasets.
          </p>
        </div>

        <form onSubmit={handleDemoSignIn} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Demo Account Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 pl-9 pr-3 text-xs rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Demo Password</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 pl-9 pr-3 text-xs rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={signingIn}
            className="w-full mt-2 h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm shadow-md transition-all cursor-pointer"
          >
            <span>{signingIn ? "Entering Demo…" : "Launch Demo Application"}</span>
            {!signingIn && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-border/60 text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            <span>Strictly isolated session • Won't affect Production</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Production User? <a href="/auth" className="text-primary font-semibold hover:underline">Access Production URL</a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── 2. Dedicated Demo Workspace & Step-by-Step Navigation ───────────────────
function DemoWorkspace({ session, onLoggedOut }: { session: any; onLoggedOut: () => void }) {
  const { withLoading } = useNavigationLoading();
  const [activeStepId, setActiveStepId] = useState<number>(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>(() => getCompletedSteps(true));
  const { enterpriseAnalysis } = useMigration();

  // Sync completed steps
  useEffect(() => {
    const handleSync = () => {
      setCompletedSteps(getCompletedSteps(true));
    };
    const handleSetStep = (e: Event) => {
      const stepId = (e as CustomEvent)?.detail?.stepId;
      if (typeof stepId === "number") {
        setActiveStepId(stepId);
      }
    };
    window.addEventListener("workflow-step-completed", handleSync);
    window.addEventListener("demo-set-active-step", handleSetStep);
    return () => {
      window.removeEventListener("workflow-step-completed", handleSync);
      window.removeEventListener("demo-set-active-step", handleSetStep);
    };
  }, []);

  // Handle step selection with strict locking validation
  const handleSelectStep = (targetStep: WorkflowStep) => {
    const unlocked = isStepUnlocked(targetStep.id, true);

    if (!unlocked) {
      if (targetStep.phase === 3) {
        window.dispatchEvent(new CustomEvent("open-demo-ended-modal"));
        toast.info(`🔒 ${targetStep.label} is locked in Demo Version. Phase 3 access requires Production.`);
        return;
      }

      const incomplete = getFirstIncompleteStep(targetStep.id, true);
      toast.error(
        `Please complete Step ${incomplete.stepNumber} (${incomplete.label}) before proceeding to Step ${targetStep.stepNumber} (${targetStep.label}).`,
        {
          action: {
            label: `Go to Step ${incomplete.stepNumber}`,
            onClick: () => {
              withLoading(
                async () => setActiveStepId(incomplete.id),
                { message: `Loading Step ${incomplete.stepNumber}: ${incomplete.label}...` },
              );
            },
          },
          duration: 6000,
        },
      );
      return;
    }

    if (activeStepId === targetStep.id) return;

    withLoading(
      async () => {
        setActiveStepId(targetStep.id);
      },
      { message: `Loading Step ${targetStep.stepNumber}: ${targetStep.label}...`, subMessage: "Preparing demo workspace..." },
    );
  };

  const handleLogout = async () => {
    await withLoading(
      async () => {
        if (supabaseDemo) {
          await supabaseDemo.auth.signOut();
        }
        toast.success("Logged out from Demo Version.");
        onLoggedOut();
      },
      { message: "Logging out from Demo...", subMessage: "Clearing demo session tokens..." },
    );
  };

  const currentStep = WORKFLOW_STEPS[activeStepId] || WORKFLOW_STEPS[0];
  const tableCount = enterpriseAnalysis?.finalTables.length ?? 0;

  return (
    <TourProvider>
      <div className="min-h-screen bg-background" id="vtab-demo-app" data-testid="vtab-demo-app">
        {/* Dedicated Demo Header */}
        <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md shadow-sm">
          <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <a href="/demo" className="flex items-center gap-2.5 group">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.62_0.2_260)] text-primary-foreground font-bold shadow-md">
                  <span className="text-xs">VT</span>
                </div>
                <div>
                  <div className="font-display font-bold text-xs tracking-wider text-foreground">VTAB SQUARE</div>
                  <div className="text-[10px] text-muted-foreground font-semibold">QLIK TO POWER BI</div>
                </div>
              </a>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] font-bold">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                DEMO VERSION
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("start-interactive-tour"))}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-all cursor-pointer"
                title="Start 14-step Interactive Guided Tour"
              >
                <Compass className="h-3.5 w-3.5" />
                <span>Start Tour</span>
              </button>

              <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground bg-surface px-3 py-1.5 rounded-xl border border-border">
                <span className="h-2 w-2 rounded-full bg-success" />
                <span className="font-mono text-[11px]">{session.user?.email || "vtabpublicuser@gmail.com"}</span>
              </div>

              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
                title="Log out of Demo only"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Log Out</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-20">
          {/* Demo Hero Banner */}
          <section className="mb-6 glass-card p-5 sm:p-6 bg-gradient-to-br from-amber-500/10 via-surface/60 to-primary/10 border border-amber-500/30 shadow-md rounded-2xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5 mb-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Interactive Live Demo Environment</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-display font-bold text-foreground">
                  Step-by-Step Migration Factory
                </h1>
                <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                  Test the complete extraction, expression conversion, and ETL analysis workflow. Each step must be completed before the next unlocks.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="surface-card px-4 py-2 border border-border/80 text-center rounded-xl">
                  <div className="text-xs text-muted-foreground">Current Step</div>
                  <div className="font-display font-bold text-base text-primary">
                    Step {currentStep.stepNumber} of 11
                  </div>
                </div>
                <div className="surface-card px-4 py-2 border border-border/80 text-center rounded-xl">
                  <div className="text-xs text-muted-foreground">Pipeline State</div>
                  <div className="font-display font-bold text-base text-foreground">
                    {tableCount ? `${tableCount} Tables` : "Ready"}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Step-by-Step Workflow Navigation Bar */}
          <div className="glass-card mb-6 p-4 border border-border/80 shadow-md rounded-2xl">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Sequential Workflow Control
                </span>
              </div>
              <span className="text-xs text-muted-foreground font-medium">
                {currentStep.label}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {WORKFLOW_STEPS.map((step, idx) => {
                const isActive = step.id === activeStepId;
                const isCompleted = isStepCompleted(step.id, true);
                const isUnlocked = isStepUnlocked(step.id, true);

                if (!isUnlocked) {
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => handleSelectStep(step)}
                      title={`Step ${step.stepNumber}: ${step.label} is locked. Complete previous steps to unlock.`}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/40 bg-surface/20 text-muted-foreground opacity-50 hover:opacity-100 hover:border-amber-500/40 cursor-pointer select-none text-xs transition-all"
                    >
                      <span className="grid h-5 w-5 place-items-center rounded-md bg-amber-500/10 text-amber-600 text-[10px] font-bold">
                        <Lock className="h-3 w-3" />
                      </span>
                      <span className="font-medium">{step.label}</span>
                    </button>
                  );
                }

                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => handleSelectStep(step)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? "border-primary bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20 scale-[1.01]"
                        : isCompleted
                        ? "border-border/80 bg-surface text-foreground hover:bg-surface/80 hover:border-primary/40"
                        : "border-border/50 bg-surface/40 text-muted-foreground hover:text-foreground hover:bg-surface/70"
                    }`}
                  >
                    <span
                      className={`grid h-5 w-5 place-items-center rounded-md text-[10px] font-bold ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : isCompleted
                          ? "bg-success/20 text-success border border-success/30"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : step.stepNumber}
                    </span>
                    <span>{step.label}</span>
                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Step Content Container */}
          <div className="surface-card p-6 border border-border/80 rounded-2xl shadow-sm">
            {activeStepId === 0 && <InstructionsPage />}
            {activeStepId === 1 && <UploadPage />}
            {activeStepId === 2 && <QvwAnalysisPage />}
            {activeStepId === 3 && <ExpressionConversionPage />}
            {activeStepId === 4 && <AnalysisPage />}
            {activeStepId === 5 && <PowerQueryPage />}
            {activeStepId === 6 && <DaxMeasuresPage />}
            {activeStepId === 7 && <SemanticModelPage />}
            {activeStepId >= 8 && <SemanticModelPage />}
          </div>
        </main>

        <FloatingWorkflowNav />
        <DemoEndedModal />
        <TourGuideOverlay />
      </div>
    </TourProvider>
  );
}
