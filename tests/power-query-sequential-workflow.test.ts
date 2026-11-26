// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getPowerQueryWorkflowState,
  setPowerQueryStepStatus,
  invalidatePowerQueryFromStep,
  resetPowerQueryWorkflow,
  validateCanExecuteStep,
} from "../src/lib/migration/power-query-workflow-state";
import {
  getCompletedSteps,
  invalidateDownstreamSteps,
  isRequiredActionCompleted,
  isStepCompleted,
  isStepUnlocked,
  markStepCompleted,
  resetWorkflowStorageOnReload,
  setRequiredActionCompleted,
  unmarkStepCompleted,
} from "../src/lib/migration/workflow-gating";

describe("Power Query Sequential Workflow Engine", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("Scenario 1: Initial State & Button Availability", () => {
    it("initializes with Step 1 (Generate M Query) enabled and Step 2 & 3 locked in both environments", () => {
      for (const isDemo of [false, true]) {
        resetPowerQueryWorkflow(isDemo);
        const state = getPowerQueryWorkflowState(isDemo);

        expect(state.step1Status).toBe("pending");
        expect(state.step2Status).toBe("pending");
        expect(state.step3Status).toBe("pending");

        // Step 2 is not allowed initially
        const step2Check = validateCanExecuteStep(isDemo, 2);
        expect(step2Check.ok).toBe(false);
        expect(step2Check.message).toBe("Please complete Generate M Query first by clicking the Generate M Query button.");

        // Step 3 is not allowed initially
        const step3Check = validateCanExecuteStep(isDemo, 3);
        expect(step3Check.ok).toBe(false);
        expect(step3Check.message).toBe("Please complete Generate M Query first by clicking the Generate M Query button.");
      }
    });
  });

  describe("Scenario 2 & 3: Step 1 Execution and Step 2 Unlocking", () => {
    it("locks Step 2 until Step 1 succeeds, and unlocks Step 2 immediately upon Step 1 success", () => {
      for (const isDemo of [false, true]) {
        resetPowerQueryWorkflow(isDemo);

        // While Step 1 is in progress
        setPowerQueryStepStatus(isDemo, 1, "in_progress");
        let state = getPowerQueryWorkflowState(isDemo);
        expect(state.step1Status).toBe("in_progress");
        expect(state.activeRunningStep).toBe(1);

        // Cannot run Step 2 while Step 1 is in progress
        const checkRunning = validateCanExecuteStep(isDemo, 2);
        expect(checkRunning.ok).toBe(false);
        expect(checkRunning.message).toContain("An operation is currently in progress");

        // Step 1 completes successfully
        setPowerQueryStepStatus(isDemo, 1, "completed");
        state = getPowerQueryWorkflowState(isDemo);
        expect(state.step1Status).toBe("completed");
        expect(state.activeRunningStep).toBeNull();

        // Step 2 is now unlocked!
        const checkUnlocked = validateCanExecuteStep(isDemo, 2);
        expect(checkUnlocked.ok).toBe(true);

        // Step 3 remains locked until Step 2 completes
        const checkStep3 = validateCanExecuteStep(isDemo, 3);
        expect(checkStep3.ok).toBe(false);
        expect(checkStep3.message).toBe("Please complete Apply and Regenerate Power Query first by clicking the Apply and Regenerate Power Query button.");
      }
    });
  });

  describe("Scenario 4: Step 2 Execution and Step 3 Unlocking", () => {
    it("unlocks Step 3 (DAX Measures) once Step 2 succeeds", () => {
      for (const isDemo of [false, true]) {
        resetPowerQueryWorkflow(isDemo);
        setPowerQueryStepStatus(isDemo, 1, "completed");

        // Step 2 runs
        setPowerQueryStepStatus(isDemo, 2, "in_progress");
        let state = getPowerQueryWorkflowState(isDemo);
        expect(state.step2Status).toBe("in_progress");

        // Cannot run Step 3 while Step 2 is in progress
        const checkRunning = validateCanExecuteStep(isDemo, 3);
        expect(checkRunning.ok).toBe(false);

        // Step 2 completes
        setPowerQueryStepStatus(isDemo, 2, "completed");
        state = getPowerQueryWorkflowState(isDemo);
        expect(state.step2Status).toBe("completed");

        // Step 3 is now unlocked!
        const checkStep3 = validateCanExecuteStep(isDemo, 3);
        expect(checkStep3.ok).toBe(true);
      }
    });
  });

  describe("Scenario 5: Direct Navigation Prevention", () => {
    it("prevents skipping steps and displays exact required guidance messages", () => {
      for (const isDemo of [false, true]) {
        resetPowerQueryWorkflow(isDemo);

        // Direct access to Step 2
        const check2 = validateCanExecuteStep(isDemo, 2);
        expect(check2.ok).toBe(false);
        expect(check2.message).toBe("Please complete Generate M Query first by clicking the Generate M Query button.");

        // Direct access to Step 3
        const check3 = validateCanExecuteStep(isDemo, 3);
        expect(check3.ok).toBe(false);
        expect(check3.message).toBe("Please complete Generate M Query first by clicking the Generate M Query button.");

        // Complete step 1 only
        setPowerQueryStepStatus(isDemo, 1, "completed");
        const check3AfterStep1 = validateCanExecuteStep(isDemo, 3);
        expect(check3AfterStep1.ok).toBe(false);
        expect(check3AfterStep1.message).toBe("Please complete Apply and Regenerate Power Query first by clicking the Apply and Regenerate Power Query button.");
      }
    });
  });

  describe("Scenario 6 & 7: Failed Operations & Retry", () => {
    it("does not unlock subsequent steps if an operation fails, and allows retry", () => {
      for (const isDemo of [false, true]) {
        resetPowerQueryWorkflow(isDemo);

        // Step 1 fails
        setPowerQueryStepStatus(isDemo, 1, "failed", "Syntax error in M compilation");
        let state = getPowerQueryWorkflowState(isDemo);
        expect(state.step1Status).toBe("failed");
        expect(state.lastError).toBe("Syntax error in M compilation");

        // Step 2 remains locked
        const checkStep2 = validateCanExecuteStep(isDemo, 2);
        expect(checkStep2.ok).toBe(false);
        expect(checkStep2.message).toBe("Please complete Generate M Query first by clicking the Generate M Query button.");

        // User retries Step 1 and succeeds
        setPowerQueryStepStatus(isDemo, 1, "completed");
        state = getPowerQueryWorkflowState(isDemo);
        expect(state.step1Status).toBe("completed");
        expect(validateCanExecuteStep(isDemo, 2).ok).toBe(true);

        // Step 2 fails
        setPowerQueryStepStatus(isDemo, 2, "failed", "Invalid date bounds");
        state = getPowerQueryWorkflowState(isDemo);
        expect(state.step2Status).toBe("failed");

        // Step 3 remains locked
        const checkStep3 = validateCanExecuteStep(isDemo, 3);
        expect(checkStep3.ok).toBe(false);
        expect(checkStep3.message).toBe("Please complete Apply and Regenerate Power Query first by clicking the Apply and Regenerate Power Query button.");

        // User retries Step 2 and succeeds
        setPowerQueryStepStatus(isDemo, 2, "completed");
        expect(validateCanExecuteStep(isDemo, 3).ok).toBe(true);
      }
    });
  });

  describe("Scenario 8: Duplicate Execution Prevention", () => {
    it("blocks concurrent execution while any step is actively running", () => {
      for (const isDemo of [false, true]) {
        resetPowerQueryWorkflow(isDemo);

        setPowerQueryStepStatus(isDemo, 1, "in_progress");
        const check2 = validateCanExecuteStep(isDemo, 2);
        const check3 = validateCanExecuteStep(isDemo, 3);

        expect(check2.ok).toBe(false);
        expect(check2.message).toContain("An operation is currently in progress");
        expect(check3.ok).toBe(false);
        expect(check3.message).toContain("An operation is currently in progress");
      }
    });
  });

  describe("Scenario 9: Invalidation of Dependent Steps", () => {
    it("invalidates Step 2 and Step 3 when Step 1 is re-executed or data types change", () => {
      for (const isDemo of [false, true]) {
        resetPowerQueryWorkflow(isDemo);

        // Progress all the way to Step 3 unlocked
        setPowerQueryStepStatus(isDemo, 1, "completed");
        setPowerQueryStepStatus(isDemo, 2, "completed");
        markStepCompleted(5, isDemo);

        expect(validateCanExecuteStep(isDemo, 3).ok).toBe(true);
        expect(isStepCompleted(5, isDemo)).toBe(true);

        // User edits data types or clicks Save/Generate M Query again -> invalidates from Step 1
        invalidatePowerQueryFromStep(isDemo, 1);

        const state = getPowerQueryWorkflowState(isDemo);
        expect(state.step1Status).toBe("pending");
        expect(state.step2Status).toBe("pending");
        expect(state.step3Status).toBe("pending");

        // Step 2 and Step 3 are locked again!
        expect(validateCanExecuteStep(isDemo, 2).ok).toBe(false);
        expect(validateCanExecuteStep(isDemo, 3).ok).toBe(false);
        expect(isStepCompleted(5, isDemo)).toBe(false);
      }
    });

    it("invalidates Step 3 when Calendar configuration changes (invalidation from Step 2)", () => {
      for (const isDemo of [false, true]) {
        resetPowerQueryWorkflow(isDemo);

        setPowerQueryStepStatus(isDemo, 1, "completed");
        setPowerQueryStepStatus(isDemo, 2, "completed");

        expect(validateCanExecuteStep(isDemo, 3).ok).toBe(true);

        // Calendar configuration altered -> invalidate from Step 2
        invalidatePowerQueryFromStep(isDemo, 2);

        const state = getPowerQueryWorkflowState(isDemo);
        // Step 1 stays completed
        expect(state.step1Status).toBe("completed");
        // Step 2 and Step 3 reset to pending
        expect(state.step2Status).toBe("pending");
        expect(state.step3Status).toBe("pending");

        // Step 2 is unlocked (since Step 1 is still completed), but Step 3 is locked
        expect(validateCanExecuteStep(isDemo, 2).ok).toBe(true);
        expect(validateCanExecuteStep(isDemo, 3).ok).toBe(false);
        expect(validateCanExecuteStep(isDemo, 3).message).toBe(
          "Please complete Apply and Regenerate Power Query first by clicking the Apply and Regenerate Power Query button."
        );
      }
    });
  });

  describe("Scenario 10: Environment Independence", () => {
    it("maintains independent state between Demo and Production", () => {
      resetPowerQueryWorkflow(false);
      resetPowerQueryWorkflow(true);

      // Complete in Production
      setPowerQueryStepStatus(false, 1, "completed");
      setPowerQueryStepStatus(false, 2, "completed");

      expect(getPowerQueryWorkflowState(false).step1Status).toBe("completed");
      expect(getPowerQueryWorkflowState(false).step2Status).toBe("completed");

      // Demo must remain pending
      expect(getPowerQueryWorkflowState(true).step1Status).toBe("pending");
      expect(getPowerQueryWorkflowState(true).step2Status).toBe("pending");
      expect(validateCanExecuteStep(true, 2).ok).toBe(false);
    });
  });

  describe("Scenario 11: Reload & Upstream Invalidation", () => {
    it("clears Power Query Regenerate M Query completion on reload and upstream ETL invalidation", () => {
      for (const isDemo of [false, true]) {
        resetPowerQueryWorkflow(isDemo);
        setPowerQueryStepStatus(isDemo, 1, "completed");
        setRequiredActionCompleted(5, isDemo, true);

        expect(getPowerQueryWorkflowState(isDemo).step1Status).toBe("completed");
        expect(isRequiredActionCompleted(5, isDemo)).toBe(true);

        // Browser reload must not preserve false Completed state
        resetWorkflowStorageOnReload(true);
        expect(getPowerQueryWorkflowState(isDemo).step1Status).toBe("pending");
        expect(isRequiredActionCompleted(5, isDemo)).toBe(false);

        // Upstream ETL invalidation must also reset Regenerate M Query completion
        setPowerQueryStepStatus(isDemo, 1, "completed");
        setRequiredActionCompleted(5, isDemo, true);
        invalidateDownstreamSteps(4, isDemo);
        expect(getPowerQueryWorkflowState(isDemo).step1Status).toBe("pending");
        expect(isRequiredActionCompleted(5, isDemo)).toBe(false);
      }
    });
  });
});
