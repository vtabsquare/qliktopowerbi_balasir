import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { useMigration } from "../src/lib/migration/store";
import { runEnterpriseAnalysis } from "../src/lib/migration/enterprise-parser";
import { parseQvwProject } from "../src/lib/migration/qvw";
import { collectRepairIssues } from "../src/lib/migration/autofix";
import { validatePowerBiModel } from "../src/lib/migration/model";
import { modelDaxInputs, validateDaxMeasures } from "../src/lib/migration/dax";
import type { ExtractedFile } from "../src/components/migration/MultiFileDropzone";

describe("Enterprise Demo Dataset clean pipeline", () => {
  it("resolves all blocking issues across all stages when Auto-Fix runs on enterprise-complex-demo.zip", async () => {
    const zipPath = path.resolve(process.cwd(), "public/demo/enterprise-complex-demo.zip");
    const zipBuffer = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(zipBuffer);
    const extracted: ExtractedFile[] = [];

    for (const [entryPath, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue;
      const ext = "." + (entryPath.split(".").pop() || "").toLowerCase();
      const isText = [".qvs", ".txt", ".csv", ".tsv", ".md", ".json", ".xml", ".yaml", ".yml", ".sql", ".properties"].includes(ext);
      const text = isText ? await zipEntry.async("text") : null;
      extracted.push({
        name: entryPath.split("/").pop() || entryPath,
        path: entryPath,
        extension: ext,
        sizeKb: text ? Number((text.length / 1024).toFixed(2)) : 0,
        text,
        parsedAsText: isText && text !== null,
        originPackage: "enterprise-complex-demo.zip",
      });
    }

    const projectFiles = extracted
      .filter((f) => f.parsedAsText)
      .map((f) => ({
        path: f.path || f.name,
        ext: f.extension || "",
        size: Math.round((f.sizeKb || 0) * 1024),
        isText: true,
        content: f.text || "",
        note: "",
      }));

    const enterprise = runEnterpriseAnalysis(projectFiles);
    const qvw = parseQvwProject(extracted);

    const store = useMigration.getState();
    store.setEnterpriseFiles(extracted);
    store.setEnterpriseAnalysis(enterprise);
    store.setEnterpriseMappingRows(
      enterprise.sourceMappings.map((mapping) => ({
        originalRef: mapping.originalRef,
        mappedRef: mapping.mappedRef,
        connectorType: mapping.connectorType,
        status: mapping.status,
        notes: mapping.notes,
        table: mapping.table,
        sourceRole: mapping.sourceRole,
        bypassQvd: mapping.bypassQvd,
        effectiveRef: mapping.effectiveRef,
        qvdProducerTable: mapping.qvdProducerTable,
      })),
    );
    store.setQvwAnalysis(qvw);

    const report = await useMigration.getState().runAutoFix();
    const afterState = useMigration.getState();
    const afterIssues = collectRepairIssues(afterState.enterpriseAnalysis, afterState.powerBiModel);
    const blockingAfter = afterIssues.filter((i) => i.severity === "blocking-error" || i.severity === "error");

    if (blockingAfter.length > 0) {
      console.log("REMAINING BLOCKING ISSUES:", JSON.stringify(blockingAfter, null, 2));
    }

    expect(report.afterBlocking).toBe(0);
    expect(blockingAfter).toHaveLength(0);

    const unmappedSources = (afterState.enterpriseAnalysis?.sourceMappings || []).filter(
      (m) => !m.bypassQvd && m.status !== "Mapped",
    );
    expect(unmappedSources).toHaveLength(0);

    const mErrors = (afterState.enterpriseAnalysis?.mQueryDiagnostics || []).filter(
      (d) => d.severity === "blocking-error" || d.severity === "error",
    );
    expect(mErrors).toHaveLength(0);

    const validatedModel = afterState.powerBiModel ? validatePowerBiModel(afterState.powerBiModel) : null;
    expect(validatedModel).not.toBeNull();
    const modelErrors = (validatedModel?.diagnostics || []).filter(
      (d) => !d.approved && (d.severity === "blocking-error" || d.severity === "error"),
    );
    expect(modelErrors).toHaveLength(0);

    const modelInputs = validatedModel ? modelDaxInputs(validatedModel.tables) : [];
    const known = new Set(modelInputs.map((m) => `${m.table.toLowerCase()}::${m.name.toLowerCase()}`));
    const enterpriseInputs = (afterState.enterpriseAnalysis?.daxMeasures ?? [])
      .filter((m) => !known.has(`${m.table.toLowerCase()}::${m.measureName.toLowerCase()}`))
      .map((m, i) => ({ id: `enterprise:${i}:${m.measureName}`, name: m.measureName, expression: m.dax, table: m.table }));
    const daxResults = validatedModel ? validateDaxMeasures([...modelInputs, ...enterpriseInputs], validatedModel.tables) : [];
    const daxErrors = daxResults.flatMap((r) => r.issues.filter((i) => i.severity === "error"));
    expect(daxErrors).toHaveLength(0);
  });
});
