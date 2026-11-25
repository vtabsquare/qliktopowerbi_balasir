// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  WORKFLOW_STEPS,
  LOCKED_STEP_MESSAGE,
  isStepCompleted,
  isStepUnlocked,
  markStepCompleted,
  invalidateDownstreamSteps,
  setWorkflowScope,
  resetWorkflowStorageOnReload,
  consumePendingReloadRedirect,
  getFirstIncompleteStep,
  resetWorkflow,
  validateStepCompletion,
  getCompletedSteps,
} from "../src/lib/migration/workflow-gating";
import { supabaseProd, supabaseDemo, isDemoEnvironment } from "../src/lib/supabase";

describe("Step-by-Step Workflow Locking System", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("has exactly 11 sequentially ordered steps across 3 phases", () => {
    expect(WORKFLOW_STEPS).toHaveLength(11);
    expect(WORKFLOW_STEPS[0].label).toBe("Instructions");
    expect(WORKFLOW_STEPS[0].phase).toBe(1);
    expect(WORKFLOW_STEPS[1].label).toBe("Upload Qlik Files");
    expect(WORKFLOW_STEPS[6].label).toBe("DAX Measures");
    expect(WORKFLOW_STEPS[6].phase).toBe(2);
    expect(WORKFLOW_STEPS[7].label).toBe("Power BI Model");
    expect(WORKFLOW_STEPS[7].phase).toBe(3);
    expect(WORKFLOW_STEPS[9].label).toBe("Validation & Export");
  });

  it("initially unlocks only Step 1 (Instructions); subsequent steps remain locked", () => {
    const isDemo = false;
    // Step 0 (Instructions) is unlocked
    expect(isStepUnlocked(0, isDemo)).toBe(true);

    // Step 1 through 10 are locked initially
    for (let i = 1; i <= 10; i++) {
      expect(isStepUnlocked(i, isDemo)).toBe(false);
    }
  });

  it("unlocks Step N only after Step N-1 is completed", () => {
    const isDemo = false;

    // Initially Step 1 (Upload, id: 1) is locked until Step 0 (Instructions) is completed
    expect(isStepUnlocked(1, isDemo)).toBe(false);

    // Complete Step 0 (Instructions)
    markStepCompleted(0, isDemo);
    expect(isStepCompleted(0, isDemo)).toBe(true);

    // Now Step 1 is unlocked!
    expect(isStepUnlocked(1, isDemo)).toBe(true);

    // Step 2 (QVW Analysis) is still locked
    expect(isStepUnlocked(2, isDemo)).toBe(false);

    // Complete Step 1 (Upload)
    markStepCompleted(1, isDemo);
    expect(isStepCompleted(1, isDemo)).toBe(true);

    // Now Step 2 is unlocked!
    expect(isStepUnlocked(2, isDemo)).toBe(true);

    // But Step 3 (Expression Conversion) remains locked
    expect(isStepUnlocked(3, isDemo)).toBe(false);
  });

  it("identifies the earliest incomplete step when a user attempts to skip ahead", () => {
    const isDemo = false;
    // User completed Step 0 (Instructions)
    markStepCompleted(0, isDemo);

    // User tries to jump to Step 5 (id: 4, ETL Analysis) without completing Step 2 (Upload, id: 1)
    const incomplete = getFirstIncompleteStep(4, isDemo);
    expect(incomplete.id).toBe(1);
    expect(incomplete.stepNumber).toBe(2);
    expect(incomplete.label).toBe("Upload Qlik Files");
  });

  it("unlocks through Validation & Export (Step 10) in Demo while locking Pipeline Logs (Step 11)", () => {
    const isDemo = true;
    // Complete Steps 1 through 9 in Demo
    for (let i = 0; i <= 8; i++) {
      markStepCompleted(i, isDemo);
    }

    // Steps 8, 9, 10 (Power BI Model, Relationships, Validation & Export) unlock sequentially in Demo
    expect(isStepUnlocked(7, isDemo)).toBe(true);
    expect(isStepUnlocked(8, isDemo)).toBe(true);
    expect(isStepUnlocked(9, isDemo)).toBe(true);

    // Step 11 (Pipeline Logs, id: 10) remains locked in Demo even after Step 10 completes
    markStepCompleted(9, isDemo);
    expect(isStepUnlocked(10, isDemo)).toBe(false);

    // In Production (isDemo = false), Step 11 unlocks once Step 10 is completed
    for (let i = 0; i <= 9; i++) {
      markStepCompleted(i, false);
    }
    expect(isStepUnlocked(10, false)).toBe(true);
  });

  it("allows completing Step 8 (Power BI Model) and Step 9 (Relationships) to unlock Step 10 (Validation & Export)", () => {
    const isDemo = false;
    // Complete steps 0 through 6 (Instructions through DAX Measures)
    for (let i = 0; i <= 6; i++) {
      markStepCompleted(i, isDemo);
    }

    // Step 8 (Power BI Model, id: 7) is unlocked
    expect(isStepUnlocked(7, isDemo)).toBe(true);

    // Step 10 (Validation & Export, id: 9) is still locked before model completion
    expect(isStepUnlocked(9, isDemo)).toBe(false);

    // When user finishes reviewing Power BI Model and completes Step 8 and 9
    markStepCompleted(7, isDemo);
    markStepCompleted(8, isDemo);

    expect(isStepCompleted(7, isDemo)).toBe(true);
    expect(isStepCompleted(8, isDemo)).toBe(true);

    // Step 10 (Validation & Export) is now unlocked!
    expect(isStepUnlocked(9, isDemo)).toBe(true);
  });

  it("persists step completion status across sessions independently for Demo and Production", () => {
    // Complete Step 1 in Demo
    markStepCompleted(1, true);
    expect(getCompletedSteps(true)).toContain(1);

    // Production should NOT have Step 1 completed
    expect(getCompletedSteps(false)).not.toContain(1);

    // Complete Step 2 in Production
    markStepCompleted(2, false);
    expect(getCompletedSteps(false)).toContain(2);
    expect(getCompletedSteps(true)).not.toContain(2);
  });

  it("validates required artifacts before unlocking subsequent steps", () => {
    // Step 2 (Upload) requires filesCount >= 1
    const invalidUpload = validateStepCompletion(1, { filesCount: 0 });
    expect(invalidUpload.ok).toBe(false);
    expect(invalidUpload.reason).toContain("Please upload at least one Qlik file");

    const validUpload = validateStepCompletion(1, { filesCount: 2 });
    expect(validUpload.ok).toBe(true);

    // Step 5 (ETL Analysis) requires enterpriseAnalysis and 0 unresolved source mappings
    const invalidAnalysis = validateStepCompletion(4, { hasEnterpriseAnalysis: false });
    expect(invalidAnalysis.ok).toBe(false);

    const unresolvedMappings = validateStepCompletion(4, {
      hasEnterpriseAnalysis: true,
      unresolvedSourceMappingsCount: 3,
    });
    expect(unresolvedMappings.ok).toBe(false);
    expect(unresolvedMappings.reason).toContain("3 file-based source mapping(s) require resolution");

    const validAnalysis = validateStepCompletion(4, {
      hasEnterpriseAnalysis: true,
      unresolvedSourceMappingsCount: 0,
    });
    expect(validAnalysis.ok).toBe(true);
  });

  it("invalidates only affected downstream steps when an earlier step changes", () => {
    markStepCompleted(0, false);
    markStepCompleted(1, false);
    markStepCompleted(2, false);
    markStepCompleted(3, false);
    markStepCompleted(4, false);

    const invalidated = invalidateDownstreamSteps(1, false);
    expect(invalidated).toEqual([2, 3, 4]);
    expect(isStepCompleted(0, false)).toBe(true);
    expect(isStepCompleted(1, false)).toBe(true);
    expect(isStepCompleted(2, false)).toBe(false);
    expect(isStepCompleted(3, false)).toBe(false);
    expect(isStepCompleted(4, false)).toBe(false);
    expect(isStepUnlocked(2, false)).toBe(true);
    expect(isStepUnlocked(3, false)).toBe(false);
    expect(LOCKED_STEP_MESSAGE).toBe("Complete the previous step successfully to unlock this step.");
  });

  it("isolates workflow completion state per project scope", () => {
    setWorkflowScope("project-a");
    markStepCompleted(0, false);
    markStepCompleted(1, false);
    expect(getCompletedSteps(false)).toEqual([0, 1]);

    setWorkflowScope("project-b");
    expect(getCompletedSteps(false)).toEqual([]);
    expect(isStepUnlocked(2, false)).toBe(false);

    setWorkflowScope("project-a");
    expect(getCompletedSteps(false)).toEqual([0, 1]);
    expect(isStepUnlocked(2, false)).toBe(true);
    setWorkflowScope(null);
  });

  it("resets workflow completion and temporary workspace storage on hard refresh while preserving auth tokens", () => {
    markStepCompleted(0, true);
    markStepCompleted(1, true);
    markStepCompleted(0, false);
    markStepCompleted(1, false);
    localStorage.setItem("qlik2pbi-enhanced-workspace-v3", JSON.stringify({ state: { powerBiModel: {} } }));
    localStorage.setItem("sb-prod-auth-token", "keep-prod-auth");
    localStorage.setItem("sb-demo-auth-token", "keep-demo-auth");
    sessionStorage.setItem("app_pipeline_started", "true");
    sessionStorage.setItem("bulk_alternate_folder_default", "C:\\Data");

    const didReset = resetWorkflowStorageOnReload(true);
    expect(didReset).toBe(true);
    expect(consumePendingReloadRedirect()).toBe(true);
    expect(consumePendingReloadRedirect()).toBe(false);

    // Only Step 1 (id: 0) remains unlocked; Steps 2+ are locked
    expect(getCompletedSteps(true)).toEqual([]);
    expect(getCompletedSteps(false)).toEqual([]);
    expect(isStepUnlocked(0, true)).toBe(true);
    expect(isStepUnlocked(1, true)).toBe(false);
    expect(isStepUnlocked(0, false)).toBe(true);
    expect(isStepUnlocked(1, false)).toBe(false);

    // Temporary workspace and session keys are cleared
    expect(localStorage.getItem("qlik2pbi-enhanced-workspace-v3")).toBeNull();
    expect(sessionStorage.getItem("app_pipeline_started")).toBeNull();
    expect(sessionStorage.getItem("bulk_alternate_folder_default")).toBeNull();

    // Auth tokens are untouched
    expect(localStorage.getItem("sb-prod-auth-token")).toBe("keep-prod-auth");
    expect(localStorage.getItem("sb-demo-auth-token")).toBe("keep-demo-auth");
  });
});

describe("Separate Demo and Production Environments", () => {
  it("uses separate Supabase clients for Demo and Production", () => {
    expect(supabaseProd).toBeDefined();
    expect(supabaseDemo).toBeDefined();
    // Verify they are distinct client instances
    expect(supabaseProd).not.toBe(supabaseDemo);
  });

  it("configures isolated auth token storage keys for Demo and Production", () => {
    const prodStorageKey = (supabaseProd as any)?.auth?.storageKey;
    const demoStorageKey = (supabaseDemo as any)?.auth?.storageKey;

    expect(prodStorageKey).toBe("sb-prod-auth-token");
    expect(demoStorageKey).toBe("sb-demo-auth-token");
    expect(prodStorageKey).not.toBe(demoStorageKey);
  });

  it("identifies Demo environment from pathname or search without requiring authentication", () => {
    // Demo environment detection is active for /demo
    expect(isDemoEnvironment()).toBe(false); // default window is /

    // When on /demo path
    window.history.replaceState({}, "", "/demo");
    expect(isDemoEnvironment()).toBe(true);

    // When on /demo with step parameters
    window.history.replaceState({}, "", "/demo?step=power-query");
    expect(isDemoEnvironment()).toBe(true);

    // Cleanup back to /
    window.history.replaceState({}, "", "/");
    expect(isDemoEnvironment()).toBe(false);
  });
});
