/**
 * Step-by-Step Workflow Control & Gating Engine
 * Enforces strict sequential step progression across Demo and Production.
 * Users must complete Step N successfully before Step N+1 is unlocked.
 */

export interface WorkflowStep {
  id: number;             // 0-based step index
  stepNumber: number;     // 1-based display number
  key: string;            // unique identifier
  label: string;          // human-readable step name
  path: string;           // route path in Production (/app/...)
  demoStepParam: string;  // query param in Demo (?step=...)
  phase: 1 | 2 | 3;       // 1: Capture & Extract, 2: Analyze & Convert, 3: Validate & Deploy
  description: string;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 0,
    stepNumber: 1,
    key: "instructions",
    label: "Instructions",
    path: "/app/instructions",
    demoStepParam: "instructions",
    phase: 1,
    description: "Review migration guidelines, supported extraction modes, and pre-requisites.",
  },
  {
    id: 1,
    stepNumber: 2,
    key: "upload",
    label: "Upload Qlik Files",
    path: "/app",
    demoStepParam: "upload",
    phase: 1,
    description: "Upload QlikView PRJ zip, QVS load scripts, or select sample enterprise dataset.",
  },
  {
    id: 2,
    stepNumber: 3,
    key: "qvw-analysis",
    label: "QVW Analysis",
    path: "/app/qvw-analysis",
    demoStepParam: "qvw-analysis",
    phase: 1,
    description: "Analyze sheet objects, chart expressions, user triggers, and sheet metadata.",
  },
  {
    id: 3,
    stepNumber: 4,
    key: "expression-conversion",
    label: "Expression Conversion",
    path: "/app/expression-conversion",
    demoStepParam: "expression-conversion",
    phase: 2,
    description: "Classify Qlik expressions, convert Set Analysis syntax, and inventory DAX candidates.",
  },
  {
    id: 4,
    stepNumber: 5,
    key: "analysis",
    label: "ETL Analysis",
    path: "/app/analysis",
    demoStepParam: "analysis",
    phase: 2,
    description: "Parse load statements, identify source vs intermediate vs final tables, and map lineage.",
  },
  {
    id: 5,
    stepNumber: 6,
    key: "power-query",
    label: "Power Query",
    path: "/app/power-query",
    demoStepParam: "power-query",
    phase: 2,
    description: "Generate and review clean M expressions for all surviving model tables.",
  },
  {
    id: 6,
    stepNumber: 7,
    key: "dax-measures",
    label: "DAX Measures",
    path: "/app/dax-measures",
    demoStepParam: "dax-measures",
    phase: 2,
    description: "Translate complex Qlik variables, aggregations, and modifiers into Power BI DAX measures.",
  },
  {
    id: 7,
    stepNumber: 8,
    key: "powerbi-model",
    label: "Power BI Model",
    path: "/app/powerbi-model",
    demoStepParam: "powerbi-model",
    phase: 3,
    description: "Review the dimensional star-schema model, table roles, and storage modes.",
  },
  {
    id: 8,
    stepNumber: 9,
    key: "relationships",
    label: "Relationships",
    path: "/app/relationships",
    demoStepParam: "relationships",
    phase: 3,
    description: "Validate cardinality, active states, cross-filter directions, and smart recommendations.",
  },
  {
    id: 9,
    stepNumber: 10,
    key: "semantic-model",
    label: "Validation & Export",
    path: "/app/semantic-model",
    demoStepParam: "semantic-model",
    phase: 3,
    description: "Execute end-to-end PBIP / TMDL semantic model validation and export deployment artifacts.",
  },
  {
    id: 10,
    stepNumber: 11,
    key: "logs",
    label: "Pipeline Logs",
    path: "/app/logs",
    demoStepParam: "logs",
    phase: 3,
    description: "Review complete migration audit logs, execution timing, and compiler diagnostics.",
  },
];

export function getStepByPath(path: string): WorkflowStep | undefined {
  const normalized = path === "/app/" ? "/app" : path.replace(/\/$/, "");
  return WORKFLOW_STEPS.find((s) => s.path === normalized);
}

export function getStepById(id: number): WorkflowStep | undefined {
  return WORKFLOW_STEPS.find((s) => s.id === id);
}

export function getStepByKey(key: string): WorkflowStep | undefined {
  return WORKFLOW_STEPS.find((s) => s.key === key || s.demoStepParam === key);
}

export const LOCKED_STEP_MESSAGE = "Complete the previous step successfully to unlock this step.";

let activeWorkflowScope: string | null = null;

export function setWorkflowScope(scopeId: string | null | undefined): void {
  const normalized = scopeId ? String(scopeId).trim() : "";
  activeWorkflowScope = normalized || null;
}

export function getWorkflowScope(): string | null {
  return activeWorkflowScope;
}

function getStorageKey(isDemo: boolean): string {
  const base = isDemo ? "workflow_completed_steps_demo_v2" : "workflow_completed_steps_prod_v2";
  return activeWorkflowScope ? `${base}_${activeWorkflowScope}` : base;
}

/**
 * Retrieve the array of completed step IDs from localStorage.
 */
export function getCompletedSteps(isDemo: boolean): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(isDemo));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const set = new Set<number>(parsed.filter((n): n is number => typeof n === "number"));
      return Array.from(set).sort((a, b) => a - b);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Check if a specific step is completed.
 */
export function isStepCompleted(stepId: number, isDemo: boolean): boolean {
  const completed = getCompletedSteps(isDemo);
  return completed.includes(stepId);
}

/**
 * Mark a step as completed and automatically unlock the next step.
 */
export function markStepCompleted(stepId: number, isDemo: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const completed = new Set(getCompletedSteps(isDemo));
    completed.add(stepId);
    localStorage.setItem(getStorageKey(isDemo), JSON.stringify(Array.from(completed)));
    // Dispatch event so all components react immediately
    window.dispatchEvent(new CustomEvent("workflow-step-completed", { detail: { stepId, isDemo } }));
  } catch (e) {
    console.error("Failed to save workflow step completion:", e);
  }
}

/**
 * Remove a step from completed set (e.g. when an earlier step is invalidated/re-run).
 */
export function unmarkStepCompleted(stepId: number, isDemo: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const completed = new Set(getCompletedSteps(isDemo));
    if (completed.has(stepId)) {
      completed.delete(stepId);
      localStorage.setItem(getStorageKey(isDemo), JSON.stringify(Array.from(completed)));
      window.dispatchEvent(new CustomEvent("workflow-step-completed", { detail: { stepId, isDemo } }));
    }
  } catch (e) {
    console.error("Failed to unmark workflow step completion:", e);
  }
}

/**
 * Invalidate all downstream completed steps (> fromStepId) when an upstream
 * step's inputs, mappings, or configuration change. Preserves earlier completed steps.
 */
export function invalidateDownstreamSteps(fromStepId: number, isDemo: boolean): number[] {
  const current = getCompletedSteps(isDemo);
  const removed = current.filter((id) => id > fromStepId);
  if (removed.length === 0) return [];
  const retained = current.filter((id) => id <= fromStepId);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(getStorageKey(isDemo), JSON.stringify(retained));
      window.dispatchEvent(new CustomEvent("workflow-step-completed", { detail: { stepId: fromStepId, isDemo, invalidated: removed } }));
    } catch (e) {
      console.error("Failed to invalidate downstream workflow steps:", e);
    }
  }
  return removed;
}

/**
 * Check if a step is unlocked for user access.
 * Rules:
 * 1. Step 0 (Step 1: Instructions) is ALWAYS unlocked.
 * 2. Step N is unlocked IF AND ONLY IF Step N-1 is completed.
 * 3. In Demo mode, Phase 3 (Steps 8-11, id >= 7) is locked due to demo licensing limits.
 */
export function isStepUnlocked(stepId: number, isDemo: boolean): boolean {
  if (stepId === 0) return true;

  // Demo Version license barrier: allow through Validation & Export (id 9); lock Pipeline Logs (id 10)
  if (isDemo && stepId >= 10) {
    return false;
  }

  // Preceding step must be completed
  return isStepCompleted(stepId - 1, isDemo);
}

/**
 * Identify the earliest incomplete step that is blocking access to targetStepId.
 */
export function getFirstIncompleteStep(targetStepId: number, isDemo: boolean): WorkflowStep {
  for (let i = 0; i < targetStepId; i++) {
    if (!isStepCompleted(i, isDemo)) {
      return WORKFLOW_STEPS[i];
    }
  }
  return WORKFLOW_STEPS[0];
}

/**
 * Validation Context used to ensure real data exists before marking a step complete.
 */
export interface WorkflowValidationContext {
  filesCount?: number;
  hasEnterpriseAnalysis?: boolean;
  hasQvwAnalysis?: boolean;
  hasExpressionInventory?: boolean;
  hasPowerBiModel?: boolean;
  hasReadyPowerBiModel?: boolean;
  hasPowerQueryOutput?: boolean;
  hasSemanticValidation?: boolean;
  hasCurrentDaxValidation?: boolean;
  hasBlockingDaxErrors?: boolean;
  isQvsOnlyMode?: boolean;
  unresolvedSourceMappingsCount?: number;
}

/**
 * Validate step completion rules before unlocking the next step.
 */
export function validateStepCompletion(
  stepId: number,
  ctx: WorkflowValidationContext,
): { ok: boolean; reason?: string } {
  switch (stepId) {
    case 0: // Instructions
      return { ok: true };

    case 1: // Upload
      if (!ctx.filesCount || ctx.filesCount < 1) {
        return {
          ok: false,
          reason: "Please upload at least one Qlik file (.zip, .qvw, or .qvs) or load the demo dataset.",
        };
      }
      return { ok: true };

    case 2: // QVW Analysis
      if (!ctx.hasQvwAnalysis && !ctx.isQvsOnlyMode) {
        return { ok: false, reason: "Complete QVW extraction, or confirm that the uploaded project is QVS-only, before proceeding." };
      }
      return { ok: true };

    case 3: // Expression Conversion
      if (!ctx.hasExpressionInventory && !ctx.hasEnterpriseAnalysis) {
        return {
          ok: false,
          reason: "Please run expression extraction to identify DAX candidates before proceeding.",
        };
      }
      return { ok: true };

    case 4: // ETL Analysis
      if (!ctx.hasEnterpriseAnalysis) {
        return {
          ok: false,
          reason: "Please run the enterprise ETL analysis engine to identify final tables and script lineage.",
        };
      }
      if (ctx.unresolvedSourceMappingsCount && ctx.unresolvedSourceMappingsCount > 0) {
        return {
          ok: false,
          reason: `${ctx.unresolvedSourceMappingsCount} file-based source mapping(s) require resolution. Select a folder with Browse Folder, run Auto Fill All Paths, and click Apply Mapping & Re-run Conversion.`,
        };
      }
      return { ok: true };

    case 5: // Power Query
      if (!ctx.hasEnterpriseAnalysis) {
        return { ok: false, reason: "Complete ETL analysis before approving generated Power Query output." };
      }
      if (!ctx.hasPowerQueryOutput) {
        return { ok: false, reason: "Generate Power Query output for the materialized model tables before proceeding." };
      }
      return { ok: true };

    case 6: // DAX Measures
      if (!ctx.hasCurrentDaxValidation) {
        return { ok: false, reason: "Run DAX validation against the latest saved measure expressions before proceeding." };
      }
      if (ctx.hasBlockingDaxErrors) {
        return { ok: false, reason: "Resolve all blocking DAX syntax, reference, function, and dependency errors before proceeding." };
      }
      return { ok: true };

    case 7: // Power BI Model
      if (!ctx.hasPowerBiModel) {
        return {
          ok: false,
          reason: "Please build and review the Power BI semantic model schema before proceeding.",
        };
      }
      if (!ctx.hasReadyPowerBiModel) {
        return { ok: false, reason: "Resolve blocking Power BI model diagnostics before approving the model." };
      }
      return { ok: true };

    case 8: // Relationships
      if (!ctx.hasPowerBiModel) {
        return { ok: false, reason: "Build the Power BI model before approving relationship recommendations." };
      }
      if (!ctx.hasReadyPowerBiModel) {
        return { ok: false, reason: "Resolve blocking relationship and model diagnostics before proceeding." };
      }
      return { ok: true };

    case 9: // Validation & Export
      if (!ctx.hasSemanticValidation) {
        return { ok: false, reason: "Resolve blocking semantic-model and export validation errors before proceeding." };
      }
      return { ok: true };

    default:
      return { ok: true };
  }
}

/**
 * Reset workflow progression for the specified environment.
 */
export function resetWorkflow(isDemo: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(getStorageKey(isDemo));
    window.dispatchEvent(new CustomEvent("workflow-step-completed", { detail: { stepId: 0, isDemo } }));
  } catch (e) {
    console.error("Failed to reset workflow:", e);
  }
}

/**
 * Universal Workflow Navigation helper
 * In Demo mode, keeps the user on /demo?step=... without reloading or leaving demo.
 * In Production mode, uses TanStack navigate({ to: path }).
 */
export function navigateWorkflow(targetPath: string, navigate?: any): void {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/demo")) {
    const step = getStepByPath(targetPath);
    if (step) {
      window.dispatchEvent(new CustomEvent("demo-set-active-step", { detail: { stepId: step.id } }));
      try {
        const targetUrl = new URL(window.location.href);
        targetUrl.searchParams.set("step", step.demoStepParam || String(step.id));
        window.history.pushState({}, "", targetUrl.toString());
      } catch {
        // ignore
      }
      return;
    }
  }

  if (navigate) {
    navigate({ to: targetPath });
  } else if (typeof window !== "undefined") {
    window.location.href = targetPath;
  }
}

