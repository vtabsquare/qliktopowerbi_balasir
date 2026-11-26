/**
 * Sequential Power Query Workflow State Manager
 * Enforces strict sequential order:
 * Step 1: Generate M Query
 * Step 2: Apply and Regenerate Power Query
 * Step 3: DAX Measures
 */
import { useEffect, useState } from "react";
import { setRequiredActionCompleted, unmarkStepCompleted } from "./workflow-gating";

export type PowerQueryStepStatus = "pending" | "in_progress" | "completed" | "failed";

export interface PowerQueryWorkflowState {
  step1Status: PowerQueryStepStatus; // Generate M Query
  step2Status: PowerQueryStepStatus; // Apply and Regenerate Power Query
  step3Status: PowerQueryStepStatus; // DAX Measures
  lastError: string | null;
  activeRunningStep: 1 | 2 | 3 | null;
}

const DEFAULT_STATE: PowerQueryWorkflowState = {
  step1Status: "pending",
  step2Status: "pending",
  step3Status: "pending",
  lastError: null,
  activeRunningStep: null,
};

function getStorageKey(isDemo: boolean): string {
  return isDemo ? "qlik2pbi_pq_workflow_demo_v1" : "qlik2pbi_pq_workflow_prod_v1";
}

export function getPowerQueryWorkflowState(isDemo: boolean): PowerQueryWorkflowState {
  if (typeof window === "undefined") return { ...DEFAULT_STATE };
  try {
    const raw = localStorage.getItem(getStorageKey(isDemo));
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return {
      step1Status: parsed.step1Status || "pending",
      step2Status: parsed.step2Status || "pending",
      step3Status: parsed.step3Status || "pending",
      lastError: parsed.lastError || null,
      activeRunningStep: parsed.activeRunningStep ?? null,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveWorkflowState(isDemo: boolean, state: PowerQueryWorkflowState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      getStorageKey(isDemo),
      JSON.stringify({
        step1Status: state.step1Status,
        step2Status: state.step2Status,
        step3Status: state.step3Status,
        lastError: state.lastError,
        activeRunningStep: state.activeRunningStep ?? null,
      })
    );
    window.dispatchEvent(new CustomEvent("pq-workflow-state-changed", { detail: { isDemo, state } }));
  } catch (e) {
    console.error("Failed to save Power Query workflow state:", e);
  }
}

export function setPowerQueryStepStatus(
  isDemo: boolean,
  step: 1 | 2 | 3,
  status: PowerQueryStepStatus,
  error?: string | null
): PowerQueryWorkflowState {
  const current = getPowerQueryWorkflowState(isDemo);
  const next: PowerQueryWorkflowState = {
    ...current,
    lastError: error ?? null,
    activeRunningStep: status === "in_progress" ? step : null,
  };

  if (step === 1) {
    next.step1Status = status;
    if (status === "failed") {
      next.step2Status = "pending";
      next.step3Status = "pending";
      unmarkStepCompleted(5, isDemo);
    }
  } else if (step === 2) {
    next.step2Status = status;
    if (status === "failed") {
      next.step3Status = "pending";
      unmarkStepCompleted(5, isDemo);
    }
  } else if (step === 3) {
    next.step3Status = status;
  }

  saveWorkflowState(isDemo, next);
  return next;
}

export function invalidatePowerQueryFromStep(isDemo: boolean, fromStep: 1 | 2 | 3): PowerQueryWorkflowState {
  const current = getPowerQueryWorkflowState(isDemo);
  const next: PowerQueryWorkflowState = { ...current };

  if (fromStep === 1) {
    next.step1Status = "pending";
    next.step2Status = "pending";
    next.step3Status = "pending";
    unmarkStepCompleted(5, isDemo);
    setRequiredActionCompleted(5, isDemo, false);
  } else if (fromStep === 2) {
    next.step2Status = "pending";
    next.step3Status = "pending";
    unmarkStepCompleted(5, isDemo);
  } else if (fromStep === 3) {
    next.step3Status = "pending";
    unmarkStepCompleted(5, isDemo);
  }

  saveWorkflowState(isDemo, next);
  return next;
}

export function resetPowerQueryWorkflow(isDemo: boolean): void {
  saveWorkflowState(isDemo, { ...DEFAULT_STATE });
  unmarkStepCompleted(5, isDemo);
  setRequiredActionCompleted(5, isDemo, false);
}

export function validateCanExecuteStep(
  isDemo: boolean,
  targetStep: 2 | 3
): { ok: boolean; message: string } {
  const state = getPowerQueryWorkflowState(isDemo);

  if (
    state.activeRunningStep !== null ||
    state.step1Status === "in_progress" ||
    state.step2Status === "in_progress" ||
    state.step3Status === "in_progress"
  ) {
    return {
      ok: false,
      message: "An operation is currently in progress. Please wait for it to finish.",
    };
  }

  if (targetStep === 2) {
    if (state.step1Status !== "completed") {
      return {
        ok: false,
        message: "Please complete Generate M Query first by clicking the Generate M Query button.",
      };
    }
    return { ok: true, message: "" };
  }

  if (targetStep === 3) {
    if (state.step1Status !== "completed") {
      return {
        ok: false,
        message: "Please complete Generate M Query first by clicking the Generate M Query button.",
      };
    }
    if (state.step2Status !== "completed") {
      return {
        ok: false,
        message: "Please complete Apply and Regenerate Power Query first by clicking the Apply and Regenerate Power Query button.",
      };
    }
    return { ok: true, message: "" };
  }

  return { ok: true, message: "" };
}

export function usePowerQueryWorkflow(isDemo: boolean) {
  const [state, setState] = useState<PowerQueryWorkflowState>(() => getPowerQueryWorkflowState(isDemo));

  useEffect(() => {
    setState(getPowerQueryWorkflowState(isDemo));

    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.isDemo === isDemo) {
        setState(customEvent.detail.state || getPowerQueryWorkflowState(isDemo));
      }
    };

    window.addEventListener("pq-workflow-state-changed", handleUpdate);
    return () => window.removeEventListener("pq-workflow-state-changed", handleUpdate);
  }, [isDemo]);

  const isStep1Completed = state.step1Status === "completed";
  const isStep2Unlocked = isStep1Completed;
  const isStep2Completed = state.step2Status === "completed";
  const isStep3Unlocked = isStep1Completed && isStep2Completed;
  const isStep3Completed = state.step3Status === "completed";

  return {
    state,
    isStep1Completed,
    isStep2Unlocked,
    isStep2Completed,
    isStep3Unlocked,
    isStep3Completed,
    setStepStatus: (step: 1 | 2 | 3, status: PowerQueryStepStatus, error?: string | null) =>
      setPowerQueryStepStatus(isDemo, step, status, error),
    invalidateFromStep: (fromStep: 1 | 2 | 3) => invalidatePowerQueryFromStep(isDemo, fromStep),
    validateStep: (step: 2 | 3) => validateCanExecuteStep(isDemo, step),
    resetWorkflow: () => resetPowerQueryWorkflow(isDemo),
  };
}
