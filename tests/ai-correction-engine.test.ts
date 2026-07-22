import { describe, expect, it } from "vitest";
import { AiCorrectionEngine } from "../src/lib/migration/agent/correction-engine";

function analysis() {
  return {
    mQueries: {
      FactSales_Final: 'let\n  Merged = Table.NestedJoin(Source, {"RegionID"}, #"Region Map", {"RegionID"}, "R", JoinKind.LeftOuter)\nin\n  Merged',
      RegionMap: 'let\n  Source = Regions\nin\n  Source',
    },
    mQueryDiagnostics: [{ id: "D1", table: "FactSales_Final", code: "M_DEPENDENCY_NOT_FOUND", category: "dependency", severity: "blocking-error", message: "Unknown named query: Region Map", offendingToken: "Region Map" }],
    validation: { issues: [], errorCount: 1, warningCount: 0, isReadyForPbipExport: false },
    profiles: {},
  } as any;
}

describe("AI correction engine", () => {
  it("proposes the smallest grounded named-query correction", () => {
    const engine = new AiCorrectionEngine();
    const proposal = engine.propose({ analysis: analysis(), diagnosticId: "D1", projectId: "P1", projectVersion: "4" });
    expect(proposal.riskLevel).toBe("low");
    expect(proposal.correctedCode).toContain('#"RegionMap"');
    expect(proposal.correctedCode).not.toContain('#"Region Map"');
    expect(proposal.status).toBe("Awaiting Approval");
  });

  it("applies a correction and keeps reconciliation pending", () => {
    const engine = new AiCorrectionEngine();
    const source = analysis();
    const proposal = engine.propose({ analysis: source, diagnosticId: "D1", projectId: "P1", projectVersion: "4" });
    const result = engine.apply(source, proposal);
    expect(result.analysis.mQueries.FactSales_Final).toContain('#"RegionMap"');
    expect(result.validation.failed).toHaveLength(0);
    expect(result.validation.status).toBe("Reconciliation Required");
    expect(result.validation.pending.join(" ")).toContain("reconciliation");
  });
});

it("creates a grounded RegionMap dependency from Qlik mapping lineage", () => {
  const source = analysis() as any;
  source.mQueries = {
    FactSales_Final: 'let\n  Added = Table.AddColumn(Source, "SalesRegionName", each let _rows = Table.SelectRows(#"RegionMap", (r as record) => r[RegionID] = [RegionID]) in if Table.IsEmpty(_rows) then "Unknown Region" else _rows{0}[RegionName])\nin\n  Added',
    Source_Regions_Stg: 'let\n  Source = Csv.Document(File.Contents("Regions.csv"))\nin\n  Source',
  };
  source.profiles = {
    Source_Regions_Stg: { table: "Source_Regions_Stg", fields: ["RegionID", "RegionName"] },
  };
  source.operations = [
    { id: "OP1", table: "Regions_Stg", opType: "load", fields: ["RegionID", "RegionName"], qvdOutputs: ["D:/QVD/Staging/Regions.qvd"], qvdInputs: [], sourceRefs: ["Regions.csv"] },
    { id: "OP2", table: "RegionMap", opType: "mapping_load", fields: ["RegionID", "RegionName"], qvdOutputs: [], qvdInputs: ["D:/QVD/Staging/Regions.qvd"], sourceRefs: ["D:/QVD/Staging/Regions.qvd"] },
  ];
  source.mQueryDiagnostics = [{ id: "D2", table: "FactSales_Final", code: "M_DEPENDENCY_NOT_FOUND", category: "dependency", severity: "blocking-error", message: "The query references unknown named query/queries: RegionMap." }];
  const engine = new AiCorrectionEngine();
  const proposal = engine.propose({ analysis: source, diagnosticId: "D2", projectId: "P1", projectVersion: "126" });
  expect(proposal.patchOperations[0].kind).toBe("insert-query");
  expect(proposal.patchOperations[0].queryName).toBe("RegionMap");
  expect(proposal.patchOperations[0].code).toContain('#"Source_Regions_Stg"');
  expect(proposal.patchOperations[0].code).toContain('"RegionID", "RegionName"');
  const result = engine.apply(source, proposal);
  expect(result.analysis.mQueries.RegionMap).toContain('#"Source_Regions_Stg"');
  expect(result.validation.failed).toHaveLength(0);
});
