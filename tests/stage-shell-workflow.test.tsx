import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StageBottomDock } from "../src/components/migration/StageBottomDock";
import { validateStepCompletion } from "../src/lib/migration/workflow-gating";

describe("viewport stage shell", () => {
  it("keeps the primary next-stage action visible and disabled when validation blocks", () => {
    const markup = renderToStaticMarkup(
      <StageBottomDock
        currentStepId={5}
        onProceedNext={() => undefined}
        onGoPrevious={() => undefined}
        canProceed={false}
        hasErrors
        blockedReason="Generate Power Query output first."
      />,
    );

    expect(markup).toContain("Proceed to Step 7: DAX Measures");
    expect(markup).toContain("disabled");
    expect(markup).toContain("Generate Power Query output first.");
  });

  it("uses a fixed viewport shell with one independently scrolling canvas", () => {
    for (const file of ["src/routes/app.tsx", "src/routes/demo.tsx"]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).toContain("h-screen w-screen");
      expect(source).toContain("overflow-hidden");
      expect(source).toContain("min-h-0 flex-1 overflow-y-auto");
      expect(source).toContain("<StageBottomDock");
      expect(source).toContain("<StageModalOverlay");
    }
  });
});

describe("modal approval workflow gates", () => {
  it("does not approve QVW, Power Query, model, or export stages without their evidence", () => {
    expect(validateStepCompletion(2, { hasQvwAnalysis: false, isQvsOnlyMode: false }).ok).toBe(false);
    expect(validateStepCompletion(2, { hasQvwAnalysis: false, isQvsOnlyMode: true }).ok).toBe(true);
    expect(validateStepCompletion(5, { hasEnterpriseAnalysis: true, hasPowerQueryOutput: false }).ok).toBe(false);
    expect(validateStepCompletion(7, { hasPowerBiModel: true, hasReadyPowerBiModel: false }).ok).toBe(false);
    expect(validateStepCompletion(8, { hasPowerBiModel: true, hasReadyPowerBiModel: false }).ok).toBe(false);
    expect(validateStepCompletion(9, { hasSemanticValidation: false }).ok).toBe(false);
  });
});

