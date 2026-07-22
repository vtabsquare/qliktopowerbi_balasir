import { describe, expect, it } from "vitest";
import { buildQlikScriptEvidence, type CorrectionDiagnostic } from "../src/lib/migration/agent/correction-engine";
import type { EnterpriseAnalysis } from "../src/lib/migration/enterprise-parser";

describe("Qlik source error highlighting", () => {
  it("links an unknown mapping query diagnostic to exact Qlik MAPPING LOAD lines", () => {
    const script = [
      "RegionMap:",
      "MAPPING LOAD",
      "  RegionID,",
      "  RegionName",
      "FROM [Regions.qvd] (qvd);",
      "",
      "FactSales_Final:",
      "LOAD *, ApplyMap('RegionMap', RegionID, 'Unknown') as SalesRegionName",
      "RESIDENT FactSales;",
    ].join("\n");
    const analysis = {
      inventory: { totalFiles: 1, textFiles: 1, files: [{ path: "Sales_ETL.qvs", ext: ".qvs", size: script.length, isText: true, content: script, note: "" }] },
      operations: [
        { id: "OP1", table: "RegionMap", opType: "mapping_load", role: "mapping", file: "Sales_ETL.qvs", startLine: 1, endLine: 5, raw: script.split("\n").slice(0,5).join("\n"), resolvedRaw: "", fields: ["RegionID", "RegionName"], calculatedFields: [], fieldExpressions: {}, sourceRefs: ["Regions.qvd"], resident: [], qvdInputs: ["Regions.qvd"], qvdOutputs: [], inlineColumns: [], inlineRows: [], where: "", groupBy: [], joinTarget: "", concatTarget: "", applymaps: [], aggregations: [], warnings: [] },
        { id: "OP2", table: "FactSales_Final", opType: "resident_load", role: "final", file: "Sales_ETL.qvs", startLine: 7, endLine: 9, raw: script.split("\n").slice(6,9).join("\n"), resolvedRaw: "", fields: [], calculatedFields: ["SalesRegionName"], fieldExpressions: { SalesRegionName: "ApplyMap('RegionMap', RegionID, 'Unknown')" }, sourceRefs: [], resident: ["FactSales"], qvdInputs: [], qvdOutputs: [], inlineColumns: [], inlineRows: [], where: "", groupBy: [], joinTarget: "", concatTarget: "", applymaps: ["RegionMap"], aggregations: [], warnings: [] },
      ],
    } as unknown as EnterpriseAnalysis;
    const diagnostic: CorrectionDiagnostic = { id: "D1", table: "FactSales_Final", code: "M_DEP", message: "Unknown named query/queries: RegionMap", severity: "blocking-error", category: "dependency", token: "RegionMap" };
    const evidence = buildQlikScriptEvidence(analysis, diagnostic, "FactSales_Final", "RegionMap");
    expect(evidence.length).toBeGreaterThanOrEqual(2);
    expect(evidence[0].file).toBe("Sales_ETL.qvs");
    expect(evidence[0].highlightedLines).toContain(1);
    expect(evidence.some((item) => item.highlightedLines.includes(8))).toBe(true);
    expect(evidence.flatMap((item) => item.tokens)).toContain("RegionMap");
  });
});
