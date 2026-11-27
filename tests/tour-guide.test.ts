import { describe, it, expect } from "vitest";
import { TOUR_STEPS } from "../src/lib/tour/tour-config";
import { checkElementViewportVisibility } from "../src/components/tour/TourGuideOverlay";

describe("Interactive Tour Guide Configuration", () => {
  it("contains exactly 14 steps", () => {
    expect(TOUR_STEPS).toHaveLength(17);
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
      "Apply & Regenerate",
      "Power BI Model",
      "Continue to Validation & Export",
      "Export & Downloads",
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
      "/app/dax-measures",
      "/app/powerbi-model",
      "/app/semantic-model",
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

  it("verifies all 17 step selector identifiers are unique and correctly structured", () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(17);

    TOUR_STEPS.forEach((step) => {
      expect(step.id).toBeTruthy();
      expect(step.shortLabel).toBeTruthy();
      expect(step.actionHint).toBeTruthy();
    });
  });
});

describe("Tour Guide Viewport Visibility and Scroll Indicator Logic", () => {
  const viewportHeight = 800;

  it("detects when target element is below the fold / viewport (triggers scroll down animation)", () => {
    // E.g. Step 9 "Apply Mapping & Re-run Conversion" located at top = 1200px
    const rectBelow = { top: 1200, bottom: 1240, width: 220, height: 40 };
    const visibility = checkElementViewportVisibility(rectBelow, viewportHeight);

    expect(visibility.isBelow).toBe(true);
    expect(visibility.isAbove).toBe(false);
    expect(visibility.isInView).toBe(false);
  });

  it("detects when target element is visible in the active viewport (shows guided tour popup and spotlight)", () => {
    // E.g. When user has scrolled down to the button
    const rectInView = { top: 400, bottom: 440, width: 220, height: 40 };
    const visibility = checkElementViewportVisibility(rectInView, viewportHeight);

    expect(visibility.isBelow).toBe(false);
    expect(visibility.isAbove).toBe(false);
    expect(visibility.isInView).toBe(true);
  });

  it("detects when target element has scrolled above the viewport fold", () => {
    // E.g. User scrolled past the button to the footer
    const rectAbove = { top: -100, bottom: 20, width: 220, height: 40 };
    const visibility = checkElementViewportVisibility(rectAbove, viewportHeight);

    expect(visibility.isBelow).toBe(false);
    expect(visibility.isAbove).toBe(true);
    expect(visibility.isInView).toBe(false);
  });

  it("handles null or zero-dimension rects safely", () => {
    expect(checkElementViewportVisibility(null, viewportHeight)).toEqual({
      isBelow: false,
      isAbove: false,
      isInView: false,
    });

    const zeroRect = { top: 0, bottom: 0, width: 0, height: 0 };
    expect(checkElementViewportVisibility(zeroRect, viewportHeight)).toEqual({
      isBelow: false,
      isAbove: false,
      isInView: false,
    });
  });
});
