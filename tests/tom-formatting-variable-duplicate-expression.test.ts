import { describe, expect, it } from "vitest";
import { buildQlikReconstructionPlan, reconstructionMeasuresAsDax } from "../src/lib/migration/reconstruction/QlikReconstructionEngine";
import { validateTomModelSpec } from "../src/lib/migration/tmdl/TmdlValidator";
import type { TomDatabaseSpec } from "../src/lib/migration/tmdl/TomModelTypes";

describe("TOM formatting variables and duplicate expressions", () => {
  it("does not convert Qlik document formatting settings into measures", () => {
    const plan = buildQlikReconstructionPlan([], {}, {
      MoneyThousandSep: "','",
      ThousandSep: "','",
      vTaxRate: "0.18",
    });
    const measures = reconstructionMeasuresAsDax(plan);
    expect(measures.some((m) => m.measureName === "MoneyThousandSep")).toBe(false);
    expect(measures.some((m) => m.measureName === "ThousandSep")).toBe(false);
    expect(measures.some((m) => m.measureName === "vTaxRate")).toBe(true);
  });

  it("allows distinct measure names to share the same DAX expression", () => {
    const spec = {
      name: "DuplicateExpressionAllowed",
      compatibilityLevel: 1604,
      model: {
        culture: "en-US",
        tables: [{
          name: "Qlik Variables",
          columns: [{
            name: "_MeasureHost",
            kind: "data",
            dataType: "int64",
            sourceColumn: "_MeasureHost",
            isHidden: true,
            isKey: false,
            summarizeBy: "none",
            annotations: [],
          }],
          measures: [
            { name: "Var A", expression: "1", displayFolder: "Qlik Variables\\Static", isHidden: false, annotations: [] },
            { name: "Var B", expression: "1", displayFolder: "Qlik Variables\\Static", isHidden: false, annotations: [] },
          ],
          hierarchies: [],
          partitions: [{ name: "Qlik Variables", mode: "import", sourceType: "m", expression: "let Source = #table({_MeasureHost}, {{1}}) in Source" }],
          annotations: [],
        }],
        relationships: [],
        annotations: [],
      },
      annotations: [],
    } as unknown as TomDatabaseSpec;
    const diagnostics = validateTomModelSpec(spec);
    expect(diagnostics.some((d) => d.code === "TMDL_DUPLICATE_MEASURE_EXPRESSION" && d.severity === "blocking-error")).toBe(false);
  });
});
