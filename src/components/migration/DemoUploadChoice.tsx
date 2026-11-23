import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  UploadCloud,
  Database,
  Loader2,
  Check,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Lock,
  X,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  extractFilesFromRawList,
  type ExtractedFile,
} from "@/components/migration/MultiFileDropzone";

interface DemoUploadChoiceProps {
  isOpen?: boolean;
  onClose?: () => void;
  onDone?: () => void;
  onFiles: (files: ExtractedFile[]) => Promise<void> | void;
  activeFilesCount: number;
  currentDatasetName?: string | null;
  onReset?: () => void;
}

export function DemoUploadChoice({
  isOpen = true,
  onClose,
  onDone,
  onFiles,
  activeFilesCount,
  currentDatasetName,
  onReset,
}: DemoUploadChoiceProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [loadingUserFile, setLoadingUserFile] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeChoice, setActiveChoice] = useState<"own" | "demo" | null>(
    activeFilesCount > 0
      ? currentDatasetName === "Enterprise Demo Dataset"
        ? "demo"
        : "own"
      : null,
  );

  useEffect(() => {
    if (activeFilesCount > 0) {
      setActiveChoice(
        currentDatasetName === "Enterprise Demo Dataset" ? "demo" : "own",
      );
    } else {
      setActiveChoice(null);
    }
  }, [activeFilesCount, currentDatasetName]);

  const handleFinish = () => {
    if (onDone) {
      onDone();
    } else if (onClose) {
      onClose();
    }
  };

  const handleSelectUserFile = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (loadingUserFile || loadingDemo) return;
    fileInputRef.current?.click();
  };

  const handleUserFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files ? Array.from(e.target.files) : [];
    if (!rawFiles.length) return;
    await processClientFiles(rawFiles);
    e.target.value = "";
  };

  const processClientFiles = async (rawFiles: File[]) => {
    setLoadingUserFile(true);
    try {
      toast.info(`Uploading and processing ${rawFiles.length} file(s)...`);
      const extracted = await extractFilesFromRawList(rawFiles);
      if (extracted.length === 0) {
        toast.error("No valid migration files found in the upload.");
        return;
      }
      setActiveChoice("own");
      await onFiles(extracted);
      toast.success("Dataset uploaded and processed successfully!", {
        description: `Parsed ${extracted.length} file(s). Click Done to close the popup and review your data.`,
      });
    } catch (err) {
      toast.error("File processing failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoadingUserFile(false);
    }
  };

  const handleDropUserFile = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) {
      await processClientFiles(files);
    }
  };

  const handleSelectDemoDataset = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (loadingDemo || loadingUserFile) return;
    setLoadingDemo(true);
    try {
      toast.info("Loading preloaded sample dataset...", { duration: 2500 });
      const response = await fetch("/demo/enterprise-complex-demo.zip");
      if (!response.ok) {
        throw new Error(
          `Demo file could not be retrieved (${response.status} ${response.statusText})`,
        );
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

      setActiveChoice("demo");
      await onFiles(extracted);
      toast.success("Demo dataset loaded successfully!", {
        description: `Loaded ${extracted.length} enterprise files with star-schema tables, QVS scripts, and QVW visuals ready for review.`,
        duration: 5000,
      });
    } catch (err) {
      toast.error("Failed to load demo dataset", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoadingDemo(false);
    }
  };

  // Lock body scroll and mark modal-open class when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.body.classList.add("modal-open");
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.classList.remove("modal-open");
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const modalNode = (
    <div className="fixed inset-0 z-[9900] w-screen h-screen flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md overflow-hidden animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-popup-title"
        className="w-full max-w-[860px] max-h-[88vh] flex flex-col rounded-[24px] border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-auto"
      >
        {/* Hidden File Input for Option 1 */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".qvw,.qvs,.qvd,.qvx,.txt,.csv,.tsv,.json,.xml,.sql,.py,.ts,.js,.yaml,.yml,.md,.xlsx,.xls,.zip"
          onChange={handleUserFileInput}
          className="hidden"
        />

        {/* 1. Header Section — Pristine Seamless Header matching Mockup */}
        <div className="px-6 sm:px-8 pt-5 pb-3 shrink-0 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-amber-50/80 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-300/80 dark:border-amber-900/60">
              <Lock className="h-3 w-3" /> DEMO VERSION MODE
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 hidden sm:inline">
                TARGET DATABASE PREREQUISITE
              </span>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="h-7 w-7 rounded-full grid place-items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label="Close popup"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <h2
            id="upload-popup-title"
            className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white mt-2 font-display"
          >
            How would you like to get started?
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Choose how you want to bring your data into the platform.
          </p>
        </div>

        {/* 2. Cards Area — Two Balanced Cards with Exact Circle Icons & Accent Borders */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-4 space-y-4">
          <div data-tour="select-upload-choice" className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
            {/* ── CARD 1: I Already Have a File (Emerald Green Accent) ── */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectUserFile()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelectUserFile();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDropUserFile}
              className={cn(
                "group relative flex flex-col justify-between p-5 sm:p-6 rounded-[20px] border transition-all duration-200 cursor-pointer select-none text-left outline-none",
                isDragOver
                  ? "border-emerald-500 bg-emerald-50/20 ring-2 ring-emerald-500/20 shadow-lg"
                  : activeChoice === "own"
                  ? "border-emerald-500 bg-white dark:bg-slate-900 shadow-md ring-1 ring-emerald-500/30"
                  : "border-emerald-300/80 dark:border-emerald-800/60 bg-white dark:bg-slate-900 hover:border-emerald-500 hover:shadow-lg hover:-translate-y-0.5",
              )}
            >
              {/* Top Bar: Circular Icon (Left) & Pill Badge (Right) */}
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-white dark:bg-slate-800 text-emerald-500 border border-emerald-300 dark:border-emerald-700 shadow-xs group-hover:scale-105 transition-transform shrink-0">
                    <UploadCloud className="h-5 w-5 text-emerald-500" />
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase bg-emerald-100/70 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    UPLOAD YOUR DATA
                  </span>
                </div>

                {/* Title & Description */}
                <div className="mt-4 space-y-1.5">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                    I Already Have a File
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed min-h-[32px]">
                    Upload your own dataset and let us process your data.
                  </p>
                </div>
              </div>

              {/* Bottom: Solid Emerald CTA Button & Footnote */}
              <div className="pt-4 space-y-2.5">
                <button
                  type="button"
                  onClick={handleSelectUserFile}
                  disabled={loadingUserFile || loadingDemo}
                  className={cn(
                    "w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 transition-all duration-150",
                    "bg-emerald-600 hover:bg-emerald-500 text-white active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
                  )}
                >
                  {loadingUserFile ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing My File...
                    </>
                  ) : (
                    <>
                      <span>Upload My File</span>
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>

                <div className="text-center text-[11px] text-slate-600 dark:text-slate-300 font-medium flex items-center justify-center gap-1.5">
                  <Check className="h-3 w-3 text-emerald-600 font-bold" />
                  <span>Supported formats: CSV, XLSX, XLS</span>
                </div>
              </div>
            </div>

            {/* ── CARD 2: Use a Demo File (Blue Accent matching Mockup) ── */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectDemoDataset()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelectDemoDataset();
                }
              }}
              className={cn(
                "group relative flex flex-col justify-between p-5 sm:p-6 rounded-[20px] border transition-all duration-200 cursor-pointer select-none text-left outline-none",
                activeChoice === "demo"
                  ? "border-blue-500 bg-white dark:bg-slate-900 shadow-md ring-1 ring-blue-500/30"
                  : "border-blue-400 dark:border-blue-700 bg-white dark:bg-slate-900 hover:border-blue-500 hover:shadow-lg hover:-translate-y-0.5",
              )}
            >
              {/* Top Bar: Circular Icon (Left) & Pill Badge (Right) */}
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-white dark:bg-slate-800 text-blue-500 border border-blue-200 dark:border-blue-700 shadow-xs group-hover:scale-105 transition-transform shrink-0">
                    <Database className="h-5 w-5 text-blue-500" />
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase bg-blue-100/70 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    INSTANT ACCESS
                  </span>
                </div>

                {/* Title & Description — Title is Vibrant Blue matching Mockup */}
                <div className="mt-4 space-y-1.5">
                  <h3 className="text-lg font-bold text-blue-600 dark:text-blue-400 tracking-tight">
                    Use a Demo File
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed min-h-[32px]">
                    Explore platform features using our preloaded sample dataset.
                  </p>
                </div>
              </div>

              {/* Bottom: Solid Blue CTA Button & Footnote */}
              <div className="pt-4 space-y-2.5">
                <button
                  type="button"
                  onClick={handleSelectDemoDataset}
                  disabled={loadingDemo || loadingUserFile}
                  className={cn(
                    "w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 transition-all duration-150",
                    "bg-blue-600 hover:bg-blue-500 text-white active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
                  )}
                >
                  {loadingDemo ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading Demo Data...
                    </>
                  ) : (
                    <>
                      <span>Use Demo File</span>
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>

                <div className="text-center text-[11px] text-blue-600 dark:text-blue-400 font-medium flex items-center justify-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-blue-500" />
                  <span>Ready-to-use sample data. Zero setup</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Active Dataset Feedback Banner inside modal */}
          {activeFilesCount > 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 sm:p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 text-xs text-slate-900 dark:text-white animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <div>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    Dataset Ready for Inspection:
                  </span>{" "}
                  <span className="text-slate-600 dark:text-slate-400">
                    {activeFilesCount} file(s) loaded. Click <strong>Done</strong> to continue.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onReset && (
                  <button
                    type="button"
                    onClick={onReset}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  data-tour="upload-done"
                  onClick={handleFinish}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                >
                  <span>Done</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 sm:p-3.5 rounded-xl border border-blue-500/30 bg-blue-50/40 dark:bg-blue-950/20 text-xs text-slate-900 dark:text-white animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-500 shrink-0" />
                <div>
                  <span className="font-semibold text-blue-700 dark:text-blue-400">
                    Ready to Continue:
                  </span>{" "}
                  <span className="text-slate-600 dark:text-slate-400">
                    Click <strong>Done</strong> to proceed with the preloaded sample dataset.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-tour="upload-done"
                  onClick={async () => {
                    await handleSelectDemoDataset();
                    handleFinish();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                >
                  <span>Done</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 4. Privacy Disclaimer Footer */}
        <div className="border-t border-slate-100 dark:border-slate-800/80 px-6 sm:px-8 py-2.5 bg-slate-50/50 dark:bg-slate-950/40 shrink-0">
          <div className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-xs">
            <div className="grid h-6 w-6 place-items-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            <div className="space-y-0.5 text-left">
              <div className="text-[10px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span>🔒 Your Data Privacy Matters</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                Your uploaded files and data are not stored or saved by us. Your data is used only for processing within this session.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalNode, document.body) : modalNode;
}
