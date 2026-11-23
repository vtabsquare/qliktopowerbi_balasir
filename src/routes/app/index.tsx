import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMigration, downloadWorkspaceBackup } from "@/lib/migration/store";
import {
  MultiFileDropzone,
  FileAnalysisPanel,
  autoAssignSourceAndEtl,
} from "@/components/migration/MultiFileDropzone";
import type { ExtractedFile } from "@/components/migration/MultiFileDropzone";
import { analyzeQvsScriptsViaAi, validateQvsScriptsViaAi } from "@/lib/migration/gemini";
import { parseSourceQvs, parseEtlQvs } from "@/lib/migration/qvs-parser";
import { validateMigrationMetadata } from "@/lib/migration/generators";
import {
  PackageOpen,
  Check,
  ArrowRight,
  Loader2,
  Database,
  AlertCircle,
  ShieldCheck,
  Download,
  UploadCloud,
  Lock,
  RefreshCw,
} from "lucide-react";
import type { MigrationValidationReport, Requirement } from "@/lib/migration/types";
import { runEnterpriseAnalysis } from "@/lib/migration/enterprise-parser";
import { cn } from "@/lib/utils";
import { parseQvwProject } from "@/lib/migration/qvw";
import { LayoutDashboard, FileWarning } from "lucide-react";
import { classifyUploadedArtifacts, type UploadClassificationResult } from "@/lib/migration/input-classifier";
import { InputClassificationPanel } from "@/components/migration/InputClassificationPanel";
import { DemoUploadChoice } from "@/components/migration/DemoUploadChoice";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTour } from "@/contexts/TourContext";
import { markStepCompleted, navigateWorkflow } from "@/lib/migration/workflow-gating";
import { useNavigationLoading } from "@/components/common/NavigationLoadingOverlay";

export const Route = createFileRoute("/app/")({
  component: UploadPage,
});

function hasQvwProjectEvidence(files: ExtractedFile[]): boolean {
  return files.some((file) => {
    const path = `${file.path || ""}/${file.name || ""}`;
    return (
      /(?:^|[/\\])[^/\\]+-prj(?:[/\\]|$)/i.test(path) ||
      /(?:qlikviewproject|docproperties|docinternals|allproperties|toplayout|loadscript|module)\.(?:xml|txt)$/i.test(path) ||
      /(?:^|[/\\])(?:SH|CH|LB|TX|BU|IB|SL|CT|MB|CS|EXT)[A-Za-z0-9_-]*\.xml$/i.test(path)
    );
  });
}

function stripTemporaryUploadPayload(files: ExtractedFile[]): ExtractedFile[] {
  return files.map(({ binaryBase64: _binaryBase64, ...file }) => file);
}

function base64ToBlob(value: string): Blob {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: "application/octet-stream" });
}

async function enrichQvwUpload(files: ExtractedFile[]): Promise<{
  files: ExtractedFile[];
  diagnostics: string[];
}> {
  const qvwFiles = files.filter((file) => file.extension.toLowerCase() === ".qvw");
  if (qvwFiles.length === 0 || hasQvwProjectEvidence(files)) {
    return { files: stripTemporaryUploadPayload(files), diagnostics: [] };
  }

  const diagnostics: string[] = [];
  const extracted: ExtractedFile[] = [];
  for (const qvw of qvwFiles) {
    if (!qvw.binaryBase64) {
      diagnostics.push(`${qvw.name}: binary payload was unavailable for local PRJ extraction.`);
      continue;
    }
    try {
      const response = await fetch(
        `/api/qvw/extract?fileName=${encodeURIComponent(qvw.name)}`,
        {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: base64ToBlob(qvw.binaryBase64),
        },
      );
      const payload = await response.json() as {
        files?: ExtractedFile[];
        error?: string;
        bridgeOutput?: string;
      };
      if (!response.ok || !Array.isArray(payload.files)) {
        throw new Error(payload.error || "The local QVW extraction bridge did not return PRJ files.");
      }
      extracted.push(...payload.files.map((file) => ({
        ...file,
        originPackage: qvw.originPackage || qvw.name,
      })));
    } catch (error) {
      diagnostics.push(
        `${qvw.name}: ${error instanceof Error ? error.message : "QVW extraction failed."}`,
      );
    }
  }

  const merged = new Map<string, ExtractedFile>();
  for (const file of [...stripTemporaryUploadPayload(files), ...extracted]) {
    merged.set(file.path.replace(/\\/g, "/").toLowerCase(), file);
  }
  return { files: [...merged.values()], diagnostics };
}

export function UploadPage() {
  const navigate = useNavigate();
  const { isDemo } = useAuth();
  const { withLoading } = useNavigationLoading();
  const {
    setEnterpriseFiles,
    enterpriseFiles,
    requirement,
    ruleBookMd,
    setSourceAnalysis,
    setEtlAnalysis,
    setMergedMetadata,
    setStageStatus,
    businessMetadata,
    technicalMetadata,
    setQvwAnalysis,
    qvwAnalysis,
    setEnterpriseAnalysis,
    setEnterpriseMappingRows,
    exportWorkspaceBackup,
    restoreWorkspaceBackup,
  } = useMigration();

  const [allFiles, setAllFiles] = useState<ExtractedFile[]>(enterpriseFiles);
  const [selectedSources, setSelectedSources] = useState<ExtractedFile[]>([]);
  const [selectedEtls, setSelectedEtls] = useState<ExtractedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptErrors, setScriptErrors] = useState<{ file: string; message: string }[]>([]);
  const [complete, setComplete] = useState(!!businessMetadata && !!technicalMetadata);
  const [validationReport, setValidationReport] = useState<MigrationValidationReport | null>(null);
  const [inputClassification, setInputClassification] = useState<UploadClassificationResult | null>(null);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(
    () => isDemo && enterpriseFiles.length === 0,
  );
  const { isOpen: isTourOpen, currentStepIndex } = useTour();

  // Keep upload modal in sync with tour steps in Demo Version (open for Step 2 & 3, closed for Step 4+)
  useEffect(() => {
    if (!isDemo || !isTourOpen) return;
    if (currentStepIndex === 1 || currentStepIndex === 2) {
      setShowUploadModal(true);
    } else if (currentStepIndex >= 3) {
      setShowUploadModal(false);
    }
  }, [isDemo, isTourOpen, currentStepIndex]);

  useEffect(() => {
    const handleOpenUploadModal = () => setShowUploadModal(true);
    const handleCloseUploadModal = () => setShowUploadModal(false);
    window.addEventListener("open-upload-modal", handleOpenUploadModal);
    window.addEventListener("close-upload-modal", handleCloseUploadModal);
    return () => {
      window.removeEventListener("open-upload-modal", handleOpenUploadModal);
      window.removeEventListener("close-upload-modal", handleCloseUploadModal);
    };
  }, []);

  const handleExportBackup = () => {
    try {
      const backup = exportWorkspaceBackup();
      downloadWorkspaceBackup(backup);
      toast.success("Workspace backup snapshot exported successfully.", {
        description: `Exported ${backup.filesCount} file(s) and full pipeline state.`,
      });
    } catch (err) {
      toast.error(`Failed to export backup: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const result = restoreWorkspaceBackup(parsed);
        if (result.ok) {
          toast.success("Backup Restored", { description: result.message });
          setAllFiles(parsed.enterpriseFiles || []);
          if (parsed.enterpriseFiles?.length > 0) {
            setInputClassification(classifyUploadedArtifacts(parsed.enterpriseFiles));
          }
          if (parsed.sourceQvsText && parsed.etlQvsText) {
            setComplete(true);
          }
        } else {
          toast.error("Restore Failed", { description: result.message });
        }
      } catch (err) {
        toast.error("Failed to parse workspace backup file. Please select a valid .q2pbi.json file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const bothSelected = selectedSources.length > 0 && selectedEtls.length > 0;
  const singleScriptMode = selectedSources.length === 1
    && selectedEtls.length === 1
    && selectedSources[0]?.path === selectedEtls[0]?.path;
  const canAnalyze = bothSelected;

  // Determine if there are actual syntax errors in the script errors array
  const hasSyntaxErrors = scriptErrors.some((err) => err.message.toLowerCase().includes("syntax"));

  const handleFiles = async (uploadedFiles: ExtractedFile[]) => {
    setComplete(false);
    setError(null);
    setScriptErrors([]);
    setSelectedSources([]);
    setSelectedEtls([]);

    const enriched = await enrichQvwUpload(uploadedFiles);
    const files = enriched.files;
    setAllFiles(files);
    setInputClassification(classifyUploadedArtifacts(files));

    // Persist the complete extracted workspace once. ETL, expressions, QVW UI
    // metadata, data types and PBIP export all consume this same project state.
    setEnterpriseFiles(files);

    const autoAssigned = autoAssignSourceAndEtl(files);
    setSelectedSources(autoAssigned.sources);
    setSelectedEtls(autoAssigned.etls);

    // Run the deterministic ETL pipeline immediately after extraction. Gemini
    // remains an optional enrichment pass and is not required for navigation.
    if (autoAssigned.sources.length > 0 && autoAssigned.etls.length > 0) {
      const sourceText = autoAssigned.sources.map((file) => file.text || "").join("\n\n");
      const etlText = autoAssigned.etls.map((file) => file.text || "").join("\n\n");
      const sourceTables = parseSourceQvs(sourceText) || [];
      const etlResult = parseEtlQvs(etlText, sourceTables);
      setSourceAnalysis({
        sourceTables,
        sourceFileName: autoAssigned.sources.map((file) => file.name).join(", "),
        text: sourceText,
      });
      setEtlAnalysis({
        ...etlResult,
        etlFileName: autoAssigned.etls.map((file) => file.name).join(", "),
        text: etlText,
      });

      const projectFiles = files
        .filter((file) => file.parsedAsText)
        .map((file) => ({
          path: file.path || file.name,
          ext: file.extension || "",
          size: Math.round((file.sizeKb || 0) * 1024),
          isText: true,
          content: file.text || "",
          note: "",
        }));
      const enterprise = runEnterpriseAnalysis(projectFiles);
      setEnterpriseAnalysis(enterprise);
      setEnterpriseMappingRows(
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
      setStageStatus(3, "complete", 100);
      setComplete(true);
    }

    const containsQvwContent = files.some((file) => {
      const path = `${file.path || ""}/${file.name || ""}`;
      return (
        file.extension.toLowerCase() === ".qvw" ||
        /(?:^|[/\\])[^/\\]+-prj(?:[/\\]|$)/i.test(path) ||
        /(?:qlikviewproject|docproperties|docinternals|allproperties|toplayout|loadscript|module)\.(?:xml|txt)$/i.test(path) ||
        /(?:^|[/\\])(?:SH|CH|LB|TX|BU|IB|SL|CT|MB|CS|EXT)[A-Za-z0-9_-]*\.xml$/i.test(path)
      );
    });
    if (containsQvwContent) {
      const qvw = parseQvwProject(files);
      for (const message of enriched.diagnostics) {
        qvw.diagnostics.unshift({
          severity: "warning",
          code: "LOCAL_QVW_EXTRACTION_UNAVAILABLE",
          message,
          recommendation:
            "Run locally on Windows with QlikView Desktop installed, or upload the QVW together with its generated -prj folder.",
        });
      }
      setQvwAnalysis(qvw);
    } else {
      setQvwAnalysis(null);
    }
  };

  const handleRunScriptAnalysis = async () => {
    if (!bothSelected) return;
    setLoading(true);
    setError(null);
    setScriptErrors([]);
    setValidationReport(null);
    setStageStatus(3, "in-progress");

    try {
      const validationFiles = [...new Map([...selectedSources, ...selectedEtls].map((file) => [file.path, file])).values()];
      const validationIssues = await validateQvsScriptsViaAi(validationFiles);

      if (validationIssues && validationIssues.length > 0) {
        setScriptErrors(validationIssues);

        // Filter out if there are any true syntax errors
        const actualSyntaxErrorsExist = validationIssues.some((err) =>
          err.message.toLowerCase().includes("syntax"),
        );

        // ONLY block progress if the issue is an actual syntax error
        if (actualSyntaxErrorsExist) {
          setStageStatus(3, "pending");
          setLoading(false);
          return;
        }
      }

      const sourceText = selectedSources.map((f) => f.text).join("\n\n");
      const etlText = selectedEtls.map((f) => f.text).join("\n\n");

      // 1. Run local parser structural mapping pass (always succeeds, used as fallback)
      const srcTables = parseSourceQvs(sourceText) || [];
      const etlRes = parseEtlQvs(etlText, srcTables);

      // 2. Invoke structured semantic AI extraction with fallback strings for missing manual inputs
      const safeReq =
        requirement ||
        ({
          reportName: "Migration",
          businessObjective: "Migrate Qlik to PBI",
          businessRequirement: "Auto migration",
        } satisfies Requirement);
      const safeRb = ruleBookMd || "# Rule Book\n- Extract metadata\n- Convert scripts\n";
      const aiResponse = await analyzeQvsScriptsViaAi(safeReq, safeRb, sourceText, etlText, {
        srcTables,
        etlRes,
      });
      const technicalMeta = aiResponse.technicalMetadata;

      // 4. Validate the merged metadata
      const finalValidationReport = validateMigrationMetadata(
        aiResponse.businessMetadata,
        technicalMeta,
      );

      // 5. Update store
      setSourceAnalysis({
        sourceTables: srcTables,
        sourceFileName: selectedSources.map((f) => f.name).join(", "),
        text: sourceText,
      });
      setEtlAnalysis({
        ...etlRes,
        etlFileName: selectedEtls.map((f) => f.name).join(", "),
        text: etlText,
      });

      setMergedMetadata({
        businessMetadata: aiResponse.businessMetadata,
        technicalMetadata: technicalMeta,
        finalTables: technicalMeta.finalTables,
        relationships: technicalMeta.relationships,
        validationReport: finalValidationReport,
      });

      setValidationReport(finalValidationReport);
      setEnterpriseFiles(allFiles); // Save files to global store here

      setStageStatus(3, "complete", 100);
      setComplete(true);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "QVS structural code lineage analysis failed.";
      setError(msg);
      setStageStatus(3, "pending");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    setEnterpriseFiles(allFiles);
    markStepCompleted(1, isDemo);
    toast.success("Step 2 (Upload Qlik Files) Completed! Step 3 (QVW Analysis) is now unlocked.");

    if (!qvwAnalysis) {
      markStepCompleted(2, isDemo);
      markStepCompleted(3, isDemo);
      toast.info("No QVW content detected", {
        description: "Skipping visualization and expression analysis stages (Steps 3 & 4) because no QVW package was found.",
        duration: 6000,
      });
      withLoading(
        async () => {
          navigate({ to: "/app/analysis" });
        },
        { message: "Loading Step 5: ETL Analysis...", subMessage: "Analyzing script lineage..." },
      );
    } else {
      withLoading(
        async () => {
          navigate({ to: "/app/qvw-analysis" });
        },
        { message: "Loading Step 3: QVW Analysis...", subMessage: "Parsing sheets and visual objects..." },
      );
    }
  };

  return (
    <div className="space-y-6">
      {isDemo && (
        <DemoUploadChoice
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onDone={() => setShowUploadModal(false)}
          onFiles={handleFiles}
          activeFilesCount={allFiles.length}
          currentDatasetName={
            allFiles.length > 0
              ? allFiles.some((f) => f.originPackage === "enterprise-complex-demo.zip")
                ? "Enterprise Demo Dataset"
                : "Custom Uploaded Dataset"
              : null
          }
          onReset={() => {
            setAllFiles([]);
            setEnterpriseFiles([]);
            setInputClassification(null);
            setQvwAnalysis(null);
            setSelectedSources([]);
            setSelectedEtls([]);
            setComplete(false);
            toast.info("Workspace cleared. Choose your data source to start.");
          }}
        />
      )}

      {/* When upload modal is open in Demo, hide background panels to prevent layout bleed */}
      {(!isDemo || !showUploadModal) && (
        <>
          {/* Contextual Guidance */}
          <div className="surface-card p-4 sm:p-5 border-l-4 border-l-primary bg-primary/5 shadow-sm">
            <h2 className="font-display text-lg font-bold text-foreground">Phase 1: Upload & Extraction</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl">
              Upload your Qlik files here. The engine will automatically parse QVS scripts, classify ETL logic, and extract any visualization packages needed for the migration pipeline.
            </p>
          </div>

          {/* Workspace Snapshot & Recovery Bar */}
          <div className="surface-card p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-border/70 rounded-xl bg-surface/50">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              Workspace Snapshot &amp; Recovery
              <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                P0 Enterprise Recovery
              </span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Export a standalone JSON snapshot of your current project or restore previously analyzed files, lineage and DAX models.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {isDemo ? (
            <button
              type="button"
              disabled
              onClick={() => toast.info("🔒 Export Snapshot is locked in the Demo Version.")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/40 bg-background/40 text-muted-foreground/50 opacity-40 cursor-not-allowed select-none transition-colors"
              title="Export Snapshot is locked in Demo Version"
            >
              <Lock className="h-3.5 w-3.5 text-muted-foreground/60" />
              Export Snapshot
            </button>
          ) : (
            <button
              type="button"
              onClick={handleExportBackup}
              disabled={allFiles.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background hover:bg-surface-elevated disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Download full workspace backup (.q2pbi.json)"
            >
              <Download className="h-3.5 w-3.5 text-primary" />
              Export Snapshot
            </button>
          )}

          {isDemo ? (
            <button
              type="button"
              disabled
              onClick={() => toast.info("🔒 Restore Snapshot is locked in the Demo Version.")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-primary/20 bg-primary/5 text-primary/40 opacity-40 cursor-not-allowed select-none transition-colors"
              title="Restore Snapshot is locked in Demo Version"
            >
              <Lock className="h-3.5 w-3.5 text-muted-foreground/60" />
              Restore Snapshot
            </button>
          ) : (
            <label
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer transition-colors"
              title="Restore workspace from a previous .q2pbi.json file"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              Restore Snapshot
              <input
                type="file"
                accept=".json,.q2pbi.json"
                onChange={handleRestoreFile}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* Upload Section */}
      {isDemo ? (
        <>
          {/* Clean In-Page Dataset Status Bar (Replacing inline container) */}
          <div className="surface-card p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-border/70 rounded-xl bg-surface/50 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary shrink-0">
                {allFiles.length > 0 ? (
                  allFiles.some((f) => f.originPackage === "enterprise-complex-demo.zip") ? (
                    <Database className="h-5 w-5" />
                  ) : (
                    <UploadCloud className="h-5 w-5" />
                  )
                ) : (
                  <PackageOpen className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {allFiles.length > 0
                      ? allFiles.some((f) => f.originPackage === "enterprise-complex-demo.zip")
                        ? "Enterprise Demo Dataset Active"
                        : "Custom Uploaded Dataset Active"
                      : "No Dataset Loaded"}
                  </h3>
                  {allFiles.length > 0 ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                      {allFiles.length} file(s) loaded
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                      Selection Required
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {allFiles.length > 0
                    ? allFiles.some((f) => f.originPackage === "enterprise-complex-demo.zip")
                      ? "Preloaded enterprise star-schema dataset with QVS scripts, CSV data, and QVW visual models."
                      : "Your custom uploaded migration package."
                    : "Click 'Upload / Choose Dataset' to bring in your data or explore with our demo dataset."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 shadow-sm transition-all"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                {allFiles.length > 0 ? "Change / Upload Dataset" : "Upload / Choose Dataset"}
              </button>
              {allFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setAllFiles([]);
                    setEnterpriseFiles([]);
                    setInputClassification(null);
                    setQvwAnalysis(null);
                    setSelectedSources([]);
                    setSelectedEtls([]);
                    setComplete(false);
                    setShowUploadModal(true);
                    toast.info("Workspace cleared.");
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-border bg-background hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reset
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="surface-card p-4 sm:p-5 space-y-3.5 shadow-sm border border-border/50">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary shrink-0">
              <PackageOpen className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-display text-base sm:text-lg font-semibold leading-snug">Upload &amp; Extraction Engine</h3>
              <p className="text-xs text-muted-foreground">
                Upload individual QVS/CSV files, a ZIP package, or an entire folder. The engine will
                extract and analyse all contents automatically.
              </p>
            </div>
          </div>
          <MultiFileDropzone onFiles={handleFiles} compact />
        </div>
      )}

      {!showUploadModal && inputClassification && <InputClassificationPanel result={inputClassification} />}

      {!showUploadModal && (qvwAnalysis ? (
        <div
          className={cn(
            "surface-card p-6 border",
            qvwAnalysis.intake.readyForVisualizationAnalysis
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-amber-500/30 bg-amber-500/5",
          )}
        >
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div
              className={cn(
                "grid h-12 w-12 place-items-center rounded-xl shrink-0",
                qvwAnalysis.intake.readyForVisualizationAnalysis
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-amber-500/10 text-amber-600",
              )}
            >
              {qvwAnalysis.intake.readyForVisualizationAnalysis ? (
                <LayoutDashboard className="h-6 w-6" />
              ) : (
                <FileWarning className="h-6 w-6" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-display text-lg font-semibold">
                QVW visualization package detected
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {qvwAnalysis.intake.readyForVisualizationAnalysis
                  ? `${qvwAnalysis.metrics.sheetCount} sheets, ${qvwAnalysis.metrics.objectCount} objects, ${qvwAnalysis.metrics.expressionCount} expressions and ${qvwAnalysis.metrics.variableCount} variables extracted.`
                  : `Package completeness is ${qvwAnalysis.intake.completenessScore}%. Missing: ${qvwAnalysis.intake.missingMandatory.join(", ") || "required project files"}.`}
              </p>
            </div>
            <button
              data-tour="review-qvw-analysis"
              onClick={() => {
                markStepCompleted(1, isDemo);
                withLoading(
                  async () => {
                    navigateWorkflow("/app/qvw-analysis", navigate);
                  },
                  { message: "Loading Step 3: QVW Analysis...", subMessage: "Parsing sheets and visual objects..." },
                );
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 cursor-pointer"
            >
              Review QVW Analysis <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="surface-card p-6 border border-border/80 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl shrink-0 bg-primary/10 text-primary">
              <LayoutDashboard className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-display text-lg font-semibold">
                QVW visualization package ready for review
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Explore extracted sheets, visual objects, expressions, and variables.
              </p>
            </div>
            <button
              data-tour="review-qvw-analysis"
              onClick={() => {
                markStepCompleted(1, isDemo);
                withLoading(
                  async () => {
                    navigateWorkflow("/app/qvw-analysis", navigate);
                  },
                  { message: "Loading Step 3: QVW Analysis...", subMessage: "Parsing sheets and visual objects..." },
                );
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 cursor-pointer"
            >
              Review QVW Analysis <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      {/* File Analysis Panel */}
      {allFiles.length > 0 && (
        <FileAnalysisPanel
          files={allFiles}
          selectedSources={selectedSources}
          selectedEtls={selectedEtls}
          onToggleSource={(f) => {
            setSelectedSources((prev) =>
              prev.some((p) => p.path === f.path)
                ? prev.filter((p) => p.path !== f.path)
                : [...prev, f],
            );
            setComplete(false);
          }}
          onToggleEtl={(f) => {
            setSelectedEtls((prev) =>
              prev.some((p) => p.path === f.path)
                ? prev.filter((p) => p.path !== f.path)
                : [...prev, f],
            );
            setComplete(false);
          }}
        />
      )}

      {/* Analyse button */}
      {allFiles.length > 0 && (
        <div className="surface-card p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-sm border border-border/50">
          <div>
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" /> Lineage Analysis Engine
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {canAnalyze
                ? singleScriptMode
                  ? `Single-QVS mode: ${selectedSources[0]?.name} will be analysed end-to-end as both source and ETL logic.`
                  : `Ready to analyse ${selectedSources.length} source and ${selectedEtls.length} ETL script(s) using the deterministic parser with optional Gemini enrichment.`
                : "Upload or select at least one QVS script. A single QVS can serve as both Source and ETL."}
            </p>
          </div>
          <button
            onClick={handleRunScriptAnalysis}
            disabled={!canAnalyze || loading || complete || hasSyntaxErrors}
            className={cn(
              "flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm shadow-lg transition-all min-w-[220px]",
              complete
                ? "bg-success text-success-foreground"
                : canAnalyze && !hasSyntaxErrors
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "bg-surface-elevated text-muted-foreground cursor-not-allowed",
            )}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Analysing Lineage…
              </>
            ) : complete ? (
              <>
                <Check className="h-4 w-4" /> Analysis Complete
              </>
            ) : (
              <>
                <Database className="h-4 w-4" /> Analyse QVS Scripts
              </>
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="surface-card p-6 border border-destructive/30 bg-destructive/5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-sm text-destructive">Lineage Engine Error</div>
            <p className="text-xs text-destructive/80 mt-1">{error}</p>
          </div>
        </div>
      )}

      {scriptErrors.length > 0 && (
        <div className="surface-card p-6 border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display text-base font-semibold text-amber-500">
                {hasSyntaxErrors ? "Syntax Validation Failed" : "Script Analysis Notices"}
              </h3>
              <p className="text-sm text-amber-500/80 mt-0.5">
                {hasSyntaxErrors
                  ? "The engine detected syntax errors in your scripts. Please fix them before proceeding."
                  : "The engine detected validation warnings or semantic notices. You can still safely proceed to analysis."}
              </p>
            </div>
          </div>
          <div className="space-y-2 mt-4">
            {scriptErrors.map((err, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg bg-surface/50 border border-border text-xs flex flex-col"
              >
                <span className="font-semibold text-foreground mb-1">{err.file}</span>
                <span className="text-muted-foreground font-mono">{err.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {validationReport && (
        <div className="surface-card p-6 border border-primary/20 bg-primary/5">
          <div className="flex items-start gap-3 mb-4">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display text-base font-semibold">
                Metadata Extraction Complete
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                The engine correlated the QVS structural model with the business requirements. Gemini enrichment is optional.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="p-4 rounded-xl bg-surface/50 border border-border">
              <div className="text-2xl font-black mb-1 gradient-text">
                {technicalMetadata?.finalTables.length || 0}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Final Tables
              </div>
            </div>
            <div className="p-4 rounded-xl bg-surface/50 border border-border">
              <div className="text-2xl font-black mb-1 gradient-text">
                {technicalMetadata?.relationships.length || 0}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Relationships
              </div>
            </div>
            <div className="p-4 rounded-xl bg-surface/50 border border-border">
              <div className="text-2xl font-black mb-1 gradient-text">
                {technicalMetadata?.relationships.length || 0}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                DAX Requirements
              </div>
            </div>
            <div className="p-4 rounded-xl bg-surface/50 border border-border">
              <div className="text-2xl font-black mb-1 gradient-text">
                {Math.max(0, 100 - (validationReport.issues?.length || 0) * 5)}/100
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Confidence
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Next Button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleNext}
          disabled={!complete || hasSyntaxErrors}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {isDemo
            ? "Proceed to ETL Analysis"
            : qvwAnalysis
              ? "Proceed to QVW Analysis"
              : "Proceed to Enterprise Analysis"}{" "}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
        </>
      )}
    </div>
  );
}
