import { describe, expect, it } from "vitest";
import { answerDeterministically } from "../src/lib/migration/agent/deterministic-agent";
import type { MigrationAgentContext } from "../src/lib/migration/agent/types";

const context: MigrationAgentContext = {
  projectId: "p1",
  projectVersionId: "2",
  currentPage: "Power Query",
  selectedTable: "FactSales_Final",
  userQuestion: "List final tables",
  projectSummary: { name: "Sales", route: "QVS", artifactCount: 1, finalTableCount: 1, blockingIssues: 1, warnings: 0 },
  finalTables: [{ name: "FactSales_Final", fields: ["SalesID", "ProfitUSD"], lineage: "Sales.csv -> FactSales_Final", joins: [], calculations: ["ProfitUSD"] }],
  generatedM: "let Source = #table({}, {}) in Source",
  diagnostics: [{ severity: "blocking-error", category: "dependency", message: "Unknown query RegionMap", table: "FactSales_Final" }],
  validation: { readyForExport: false, errorCount: 1, warningCount: 0 },
};

describe("migration AI deterministic grounding", () => {
  it("lists final tables only from supplied project evidence", () => {
    const result = answerDeterministically(context);
    expect(result.answer).toContain("FactSales_Final");
    expect(result.answer).toContain("2 columns");
    expect(result.provider).toBe("deterministic");
  });

  it("creates a governed proposal for a deterministic error", () => {
    const result = answerDeterministically({ ...context, userQuestion: "Fix the current error" });
    expect(result.finding).toContain("RegionMap");
    expect(result.proposal?.status).toBe("proposed");
    expect(result.proposal?.rollbackAvailable).toBe(true);
    expect(result.validationRequired).toContain("Dependency validation");
  });
});
