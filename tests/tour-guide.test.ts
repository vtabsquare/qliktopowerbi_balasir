import { describe, it, expect } from "vitest";
import { TOUR_STEPS } from "../src/lib/tour/tour-config";

describe("Interactive Tour Guide Configuration", () => {
  it("contains exactly 14 steps", () => {
    expect(TOUR_STEPS).toHaveLength(14);
  });

  it("maintains the exact 14 step titles and order specified in requirements", () => {
    const expectedTitles = [
      "Continue to Upload",
      "Select Any One",
      "Done",
      "Review QVW Analysis",
      "Convert Expression",
      "Save",
      "Approved",
      "Proceed to ETL Analysis",
      "Apply Mapping & Re-run Conversion",
      "Power Query M Code",
      "Generate M Query",
      "Apply and Regenerate Power Query",
      "DAX Measure",
      "Semantic Model",
    ];

    TOUR_STEPS.forEach((step, idx) => {
      expect(step.stepNumber).toBe(idx + 1);
      expect(step.title).toBe(expectedTitles[idx]);
    });
  });

  it("maps each step to an explicit data-tour selector and target application route", () => {
    const expectedRoutes = [
      "/app/instructions",
      "/app",
      "/app",
      "/app",
      "/app/qvw-analysis",
      "/app/expression-conversion",
      "/app/expression-conversion",
      "/app/expression-conversion",
      "/app/analysis",
      "/app/analysis",
      "/app/power-query",
      "/app/power-query",
      "/app/power-query",
      "/app/dax-measures",
    ];

    TOUR_STEPS.forEach((step, idx) => {
      expect(step.selector).toContain("data-tour=");
      expect(step.targetRoute).toBe(expectedRoutes[idx]);
      expect(step.explanation.length).toBeGreaterThan(15);
    });
  });

  it("provides prepareStep handlers for stages requiring dynamic modal or tab state", () => {
    const step2 = TOUR_STEPS.find((s) => s.id === "select-upload-choice");
    const step3 = TOUR_STEPS.find((s) => s.id === "upload-done");
    const step4 = TOUR_STEPS.find((s) => s.id === "review-qvw-analysis");
    const step9 = TOUR_STEPS.find((s) => s.id === "apply-mapping");
    const step11 = TOUR_STEPS.find((s) => s.id === "generate-m-query");

    expect(typeof step2?.prepareStep).toBe("function");
    expect(typeof step3?.prepareStep).toBe("function");
    expect(typeof step4?.prepareStep).toBe("function");
    expect(typeof step9?.prepareStep).toBe("function");
    expect(typeof step11?.prepareStep).toBe("function");
  });

  it("verifies all 14 step selector identifiers are unique and correctly structured", () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(14);

    TOUR_STEPS.forEach((step) => {
      expect(step.id).toBeTruthy();
      expect(step.shortLabel).toBeTruthy();
      expect(step.actionHint).toBeTruthy();
    });
  });
});
