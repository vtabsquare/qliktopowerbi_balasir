// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  WORKFLOW_STEPS,
  isStepCompleted,
  isStepUnlocked,
  markStepCompleted,
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

  it("strictly locks Phase 3 (Steps 8-11) in Demo mode even if preceding steps are complete", () => {
    const isDemo = true;
    // Complete all Phase 1 and Phase 2 steps in Demo
    for (let i = 0; i <= 6; i++) {
      markStepCompleted(i, isDemo);
    }

    // Step 7 (DAX Measures) is completed
    expect(isStepCompleted(6, isDemo)).toBe(true);

    // Step 8 (Power BI Model) must be locked in Demo
    expect(isStepUnlocked(7, isDemo)).toBe(false);

    // Step 9, 10, 11 must also be locked in Demo
    expect(isStepUnlocked(8, isDemo)).toBe(false);
    expect(isStepUnlocked(9, isDemo)).toBe(false);
    expect(isStepUnlocked(10, isDemo)).toBe(false);

    // But in Production (isDemo = false), Step 8 is unlocked!
    markStepCompleted(6, false);
    expect(isStepUnlocked(7, false)).toBe(true);
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

    // Step 5 (ETL Analysis) requires enterpriseAnalysis
    const invalidAnalysis = validateStepCompletion(4, { hasEnterpriseAnalysis: false });
    expect(invalidAnalysis.ok).toBe(false);

    const validAnalysis = validateStepCompletion(4, { hasEnterpriseAnalysis: true });
    expect(validAnalysis.ok).toBe(true);
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
});
