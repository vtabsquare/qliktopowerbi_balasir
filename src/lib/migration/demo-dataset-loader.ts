import JSZip from "jszip";
import { useMigration } from "@/lib/migration/store";
import { autoAssignSourceAndEtl, type ExtractedFile } from "@/components/migration/MultiFileDropzone";
import { parseSourceQvs, parseEtlQvs } from "@/lib/migration/qvs-parser";
import { runEnterpriseAnalysis } from "@/lib/migration/enterprise-parser";
import { parseQvwProject } from "@/lib/migration/qvw";

let isHydrating = false;

export async function loadDemoDatasetToStore(force = false): Promise<boolean> {
  const store = useMigration.getState();
  if (!force && store.enterpriseFiles.length > 0 && store.qvwAnalysis && store.enterpriseAnalysis) {
    return true;
  }
  if (isHydrating) return false;
  isHydrating = true;

  try {
    const response = await fetch("/demo/enterprise-complex-demo.zip");
    if (!response.ok) {
      console.warn("Demo ZIP dataset could not be fetched:", response.status, response.statusText);
      return false;
    }
    const blob = await response.blob();
    const zip = await JSZip.loadAsync(blob);
    const extracted: ExtractedFile[] = [];

    for (const [path, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue;
      const ext = "." + (path.split(".").pop() || "").toLowerCase();
      const entryWithSize = zipEntry as unknown as {
        _data?: { uncompressedSize?: number };
      };
      const sizeKb = parseFloat(
        ((entryWithSize._data?.uncompressedSize ?? 0) / 1024).toFixed(2),
      );
      const isText = [
        ".qvs",
        ".txt",
        ".csv",
        ".tsv",
        ".md",
        ".json",
        ".xml",
        ".yaml",
        ".yml",
        ".sql",
        ".properties",
      ].includes(ext);
      const text = isText ? await zipEntry.async("text") : null;
      const binaryBase64 =
        ext === ".qvw" ? await zipEntry.async("base64") : undefined;

      extracted.push({
        path,
        name: path.split("/").pop()!,
        extension: ext,
        sizeKb,
        text,
        parsedAsText: text !== null,
        binaryBase64,
        originPackage: "enterprise-complex-demo.zip",
      });
    }

    if (extracted.length === 0) return false;

    // 1. Set files
    store.setEnterpriseFiles(extracted);

    // 2. Auto-assign sources and ETLs
    const autoAssigned = autoAssignSourceAndEtl(extracted);
    if (autoAssigned.sources.length > 0 && autoAssigned.etls.length > 0) {
      const sourceText = autoAssigned.sources.map((f) => f.text || "").join("\n\n");
      const etlText = autoAssigned.etls.map((f) => f.text || "").join("\n\n");
      const sourceTables = parseSourceQvs(sourceText) || [];
      const etlResult = parseEtlQvs(etlText, sourceTables);
      store.setSourceAnalysis({
        sourceTables,
        sourceFileName: autoAssigned.sources.map((f) => f.name).join(", "),
        text: sourceText,
      });
      store.setEtlAnalysis({
        ...etlResult,
        etlFileName: autoAssigned.etls.map((f) => f.name).join(", "),
        text: etlText,
      });

      const projectFiles = extracted
        .filter((f) => f.parsedAsText || Boolean(f.binaryBase64))
        .map((f) => ({
          path: f.path || f.name,
          ext: f.extension || "",
          size: Math.round((f.sizeKb || 0) * 1024),
          isText: Boolean(f.parsedAsText),
          content: f.text || "",
          binaryBase64: f.binaryBase64,
          note: "",
        }));

      const enterprise = runEnterpriseAnalysis(projectFiles);
      store.setEnterpriseAnalysis(enterprise);
      store.setEnterpriseMappingRows(
        enterprise.sourceMappings.map((m) => ({
          originalRef: m.originalRef,
          mappedRef: m.mappedRef,
          connectorType: m.connectorType,
          status: m.status,
          notes: m.notes,
          table: m.table,
          sourceRole: m.sourceRole,
          bypassQvd: m.bypassQvd,
          effectiveRef: m.effectiveRef,
          qvdProducerTable: m.qvdProducerTable,
        })),
      );
      store.setStageStatus(3, "complete", 100);
    }

    // 3. Parse QVW project
    const containsQvw = extracted.some((f) => {
      const p = `${f.path || ""}/${f.name || ""}`;
      return (
        f.extension.toLowerCase() === ".qvw" ||
        /(?:^|[/\\])[^/\\]+-prj(?:[/\\]|$)/i.test(p) ||
        /(?:qlikviewproject|docproperties|docinternals|allproperties|toplayout|loadscript|module)\.(?:xml|txt)$/i.test(p) ||
        /(?:^|[/\\])(?:SH|CH|LB|TX|BU|IB|SL|CT|MB|CS|EXT)[A-Za-z0-9_-]*\.xml$/i.test(p)
      );
    });

    if (containsQvw) {
      const qvw = parseQvwProject(extracted);
      store.setQvwAnalysis(qvw);
    }

    return true;
  } catch (err) {
    console.error("Failed to load demo dataset to store:", err);
    return false;
  } finally {
    isHydrating = false;
  }
}
