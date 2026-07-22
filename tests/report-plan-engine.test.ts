import { describe, expect, it } from "vitest";
import { buildProfessionalReportPlan } from "../src/lib/migration/report-designer";
import type { PowerBiModelState } from "../src/lib/migration/model";

const model: PowerBiModelState = {
  id: "m", projectName: "Sales", generatedAt: new Date().toISOString(), version: "1", viewMode: "powerbi", buildMode: "automatic",
  tables: [{ id: "t", name: "FactSales", sourceName: "FactSales", kind: "fact", hidden: false, sourceLineage: [], warnings: [], hierarchies: [],
    columns: [
      { id: "c1", name: "OrderDate", sourceName: "OrderDate", dataType: "date", hidden: false, isKey: false },
      { id: "c2", name: "Region", sourceName: "Region", dataType: "string", hidden: false, isKey: false },
    ],
    measures: [{ id: "m1", name: "Total Sales", expression: "SUM(FactSales[Sales])", homeTable: "FactSales", hidden: false, approved: true, status: "valid" }]
  }], relationships: [], originalQlikAssociations: [], layout: {}, diagnostics: [], visualBindings: [], readiness: "ready", blockingErrorCount: 0, warningCount: 0, expressionArtifactIds: []
};

describe("professional report plan", () => {
  it("creates a non-blank 360-degree report without Qlik UI metadata", () => {
    const plan = buildProfessionalReportPlan(model, null);
    expect(plan.generationMode).toBe("ai-360");
    expect(plan.pages.some((p) => p.displayName === "Executive Overview")).toBe(true);
    expect(plan.kpis[0].measure).toBe("Total Sales");
    expect(plan.pages.flatMap((p) => p.visuals).some((v) => v.bindings.some((b) => b.queryRef === "FactSales.Total Sales"))).toBe(true);
  });
});
