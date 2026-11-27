import { useRef, useState, useEffect, useCallback } from "react";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import {
  FileUp,
  Upload,
  FolderOpen,
  Archive,
  FileCode2,
  FileText,
  Database,
  BarChart3,
  Layers,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Eye,
  ArrowRight,
  Package,
  Sparkles,
  TrendingUp,
  Shield,
  LayoutDashboard,
  Download,
  FolderInput,
  FolderCheck,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { qvdToCSV } from "@/lib/migration/qvd-parser";
import { cn } from "@/lib/utils";

export interface ExtractedFile {
  path: string;
  name: string;
  extension: string;
  sizeKb: number;
  text: string | null;
  parsedAsText: boolean;
  /** Temporary upload payload used only by the local Windows QVW extraction bridge. */
  binaryBase64?: string;
  originPackage?: string;
  /** Set to true on a synthetic .csv file that was auto-converted from a .qvd */
  qvdConverted?: boolean;
  /** Absolute path where the converted CSV was physically saved on disk */
  savedCsvPath?: string;
  /** Extracted sheets when the file is a multi-sheet Excel workbook */
  excelSheets?: Array<{ name: string; csvText: string }>;
}

export interface AutoAssignedFiles {
  sources: ExtractedFile[];
  etls: ExtractedFile[];
}

interface Props {
  onFiles: (files: ExtractedFile[]) => void | Promise<void>;
  compact?: boolean;
}

const TEXT_EXTENSIONS = new Set([
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
  ".js",
  ".ts",
  ".py",
  ".ps1",
  ".properties",
]);

function isTextFile(ext: string) {
  return TEXT_EXTENSIONS.has(ext.toLowerCase());
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function parseExcelWorkbookSheets(blobOrBuffer: Blob | ArrayBuffer): Promise<Array<{ name: string; csvText: string }>> {
  try {
    const buffer = blobOrBuffer instanceof ArrayBuffer ? blobOrBuffer : await blobOrBuffer.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    return workbook.SheetNames
      .filter((name) => Boolean(workbook.Sheets[name]))
      .map((name) => ({ name, csvText: XLSX.utils.sheet_to_csv(workbook.Sheets[name]) }));
  } catch (err) {
    console.warn("Failed to parse Excel workbook:", err);
    return [];
  }
}

/** Backwards-compatible helper for callers that explicitly need one sheet. */
export async function parseExcelToCsvText(blobOrBuffer: Blob | ArrayBuffer): Promise<string | null> {
  return (await parseExcelWorkbookSheets(blobOrBuffer))[0]?.csvText ?? null;
}

export async function extractFilesFromRawList(
  rawFiles: File[],
  outputDir: string = "",
  dirHandle?: any,
): Promise<ExtractedFile[]> {
  const result: ExtractedFile[] = [];
  for (const file of rawFiles) {
    const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
    if (ext === ".zip") {
      try {
        const extractZipRecursive = async (
          zipSource: File | ArrayBuffer,
          originPackage: string,
          prefix: string,
          depth: number,
        ) => {
          if (depth > 4) return;
          const loadedSource =
            zipSource instanceof Blob && typeof zipSource.arrayBuffer === "function"
              ? await zipSource.arrayBuffer()
              : zipSource;
          const zip = await JSZip.loadAsync(loadedSource);
          for (const [rawPath, zipEntry] of Object.entries(zip.files)) {
            if (zipEntry.dir) continue;
            const path = prefix ? `${prefix}/${rawPath}` : rawPath;
            const entryName = rawPath.split("/").pop() || rawPath;
            const entryExt = "." + (entryName.split(".").pop() ?? "").toLowerCase();
            if (entryExt === ".zip") {
              try {
                const nestedBuf = await zipEntry.async("arraybuffer");
                await extractZipRecursive(
                  nestedBuf,
                  `${originPackage} -> ${entryName}`,
                  path.replace(/\.zip$/i, ""),
                  depth + 1,
                );
              } catch (nestedErr) {
                console.warn("Nested ZIP parse failed:", path, nestedErr);
              }
              continue;
            }
            const entryWithSize = zipEntry as unknown as { _data?: { uncompressedSize?: number } };
            const sizeKb = parseFloat(((entryWithSize._data?.uncompressedSize ?? 0) / 1024).toFixed(2));
            let text: string | null = null;
            let excelSheets: Array<{ name: string; csvText: string }> | undefined;
            if (isTextFile(entryExt)) {
              text = await zipEntry.async("text");
            } else if ([".xlsx", ".xls"].includes(entryExt)) {
              const buf = await zipEntry.async("arraybuffer");
              excelSheets = await parseExcelWorkbookSheets(buf);
              text = excelSheets[0]?.csvText ?? null;
            }
            const binaryBase64 = (entryExt === ".qvw" || entryExt === ".xlsx" || entryExt === ".xls") ? await zipEntry.async("base64") : undefined;
            const entry: ExtractedFile = {
              path,
              name: entryName,
              extension: entryExt,
              sizeKb,
              text,
              parsedAsText: text !== null,
              binaryBase64,
              originPackage,
              excelSheets,
            };
            result.push(entry);
            if (entryExt === ".qvd" && outputDir !== "__SKIP__") {
              const qvdBlob = await zipEntry.async("blob");
              const qvdFile = new File([qvdBlob], entry.name, { type: "application/octet-stream" });
              const conv = await convertQvdFile(qvdFile, path, outputDir, dirHandle);
              if ("csvFile" in conv) result.push(conv.csvFile);
            }
          }
        };
        await extractZipRecursive(file, file.name, "", 0);
      } catch (e) {
        console.warn("ZIP parse failed:", file.name, e);
      }
    } else {
      const sizeKb = parseFloat((file.size / 1024).toFixed(2));
      let text: string | null = null;
      let excelSheets: Array<{ name: string; csvText: string }> | undefined;
      if (isTextFile(ext)) {
        text = await file.text();
      } else if ([".xlsx", ".xls"].includes(ext)) {
        excelSheets = await parseExcelWorkbookSheets(file);
        text = excelSheets[0]?.csvText ?? null;
      }
      const binaryBase64 = (ext === ".qvw" || ext === ".xlsx" || ext === ".xls") ? await blobToBase64(file) : undefined;
      const filePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      result.push({
        path: filePath,
        name: file.name,
        extension: ext,
        sizeKb,
        text,
        parsedAsText: text !== null,
        binaryBase64,
        excelSheets,
      });
      if (ext === ".qvd" && outputDir !== "__SKIP__") {
        const conv = await convertQvdFile(file, filePath, outputDir, dirHandle);
        if ("csvFile" in conv) result.push(conv.csvFile);
      }
    }
  }
  return result;
}

function getFileColor(ext: string): string {
  switch (ext) {
    case ".qvw":
      return "from-fuchsia-600 to-violet-700";
    case ".qvs":
      return "from-violet-500 to-purple-600";
    case ".qvd":
      return "from-teal-500 to-emerald-700";
    case ".csv":
      return "from-emerald-500 to-green-600";
    case ".txt":
      return "from-blue-500 to-cyan-600";
    case ".json":
      return "from-amber-500 to-orange-600";
    case ".xml":
      return "from-rose-500 to-pink-600";
    case ".sql":
      return "from-sky-500 to-blue-600";
    default:
      return "from-slate-500 to-slate-600";
  }
}

function getFileIcon(ext: string) {
  switch (ext) {
    case ".qvw":
      return LayoutDashboard;
    case ".qvs":
      return FileCode2;
    case ".qvd":
      return Database;
    case ".csv":
      return Database;
    case ".sql":
      return Database;
    default:
      return FileText;
  }
}

function getSourceScore(file: ExtractedFile) {
  const path = file.path.toLowerCase();
  const text = (file.text ?? "").slice(0, 12000).toLowerCase();
  let score = 0;
  if (
    /(^|[/\\])(source|sources|extract|extraction|input|inputs|landing|raw|qvd|connector|connectors|metadata)([/\\]|_|-|\.|$)/i.test(
      file.path,
    )
  )
    score += 6;
  if (
    /\b(from|lib connect to|odbc connect|ole db|sql select|load\s+\*\s+from|resident)\b/i.test(text)
  )
    score += 3;
  if (/\.(csv|tsv|json|xml|xlsx?)$/.test(path)) score += 4;
  if (
    /\b(transform|transformation|etl|model|fact|dim|calendar|mapping|aggregate|join|concatenate|applymap|intervalmatch)\b/i.test(
      file.path,
    )
  )
    score -= 3;
  return score;
}

function getEtlScore(file: ExtractedFile) {
  const path = file.path.toLowerCase();
  const text = (file.text ?? "").slice(0, 12000).toLowerCase();
  let score = 0;
  if (
    /\b(etl|transform|transformation|model|fact|dimension|dim|calendar|mapping|aggregate|mart|staging|final)\b/i.test(
      file.path,
    )
  )
    score += 6;
  if (
    /\b(resident|join|left join|inner join|concatenate|applymap|group by|where exists|intervalmatch|drop table|store\s+.+into)\b/i.test(
      text,
    )
  )
    score += 4;
  if (/\.(qvs|sql|py|js|ts)$/.test(path)) score += 2;
  if (/\b(source|sources|extract|extraction|input|raw|connector|metadata)\b/i.test(file.path))
    score -= 2;
  return score;
}

export function autoAssignSourceAndEtl(files: ExtractedFile[]): AutoAssignedFiles {
  const assignableFiles = files.filter((file) => file.parsedAsText);
  const scriptCandidates = assignableFiles.filter((file) => {
    const extension = file.extension?.toLowerCase();
    const name = file.name.toLowerCase();
    return (
      [".qvs", ".sql"].includes(extension) ||
      name === "loadscript.txt" ||
      /(?:^|[/\\])(load|etl|extract|transform|model|script)[^/\\]*\.txt$/i.test(file.path)
    );
  });
  const qvsFiles = scriptCandidates.filter((file) => file.extension?.toLowerCase() === ".qvs");
  const candidates = qvsFiles.length > 0 ? qvsFiles : scriptCandidates;

  if (candidates.length === 0) {
    if (assignableFiles.length === 1) return { sources: [assignableFiles[0]], etls: [assignableFiles[0]] };
    return { sources: [], etls: [] };
  }
  if (candidates.length === 1) return { sources: [candidates[0]], etls: [candidates[0]] };

  const sources = candidates.filter((file) => {
    const text = (file.text ?? "").slice(0, 12000);
    return (
      /(^|[/\\]|_|-|\.)(extract|extraction|config|configuration)([/\\]|_|-|\.|$)/i.test(
        file.path,
      ) ||
      /\b(extract|extraction|config|configuration|lib connect to|odbc connect|ole db|sql select|load\s+\*\s+from)\b/i.test(
        text,
      )
    );
  });
  const etls = candidates.filter((file) => !sources.some((source) => source.path === file.path));

  if (sources.length > 0 && etls.length > 0) return { sources, etls };

  const scored = candidates.map((file, index) => ({
    file,
    index,
    sourceScore: getSourceScore(file),
    etlScore: getEtlScore(file),
  }));

  const rankedSources = [...scored].sort(
    (a, b) => b.sourceScore - a.sourceScore || a.index - b.index,
  );
  const source = rankedSources[0].file;
  const remaining = candidates.filter((file) => file.path !== source.path);

  return { sources: [source], etls: remaining };
}

// Animated counter hook
function useCounter(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setValue(target);
        clearInterval(timer);
      } else setValue(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

// ─── QVD output directory state (persisted in localStorage) ──────────────────
const QVD_OUTPUT_DIR_KEY = "qvd_output_dir";

function useQvdOutputDir() {
  const [dir, setDir] = useState<string>(() => {
    try { return localStorage.getItem(QVD_OUTPUT_DIR_KEY) || ""; } catch { return ""; }
  });
  const save = useCallback((val: string) => {
    setDir(val);
    try { localStorage.setItem(QVD_OUTPUT_DIR_KEY, val); } catch { /* ignore */ }
  }, []);
  return [dir, save] as const;
}

// ─── QVD conversion helper ───────────────────────────────────────────────────
async function convertQvdFile(
  file: File,
  filePath: string,
  outputDir: string,
  dirHandle?: any,
): Promise<{ csvFile: ExtractedFile; savedPath: string } | { error: string }> {
  try {
    const csvName = file.name.replace(/\.qvd$/i, ".csv");
    const csvPath = filePath.replace(/\.qvd$/i, ".csv");

    // ── Attempt 1: server-side pyqvd conversion (same output as running pyqvd manually) ──
    let csvText = "";
    let savedPath = "";
    let rowCount = 0;
    let usedPyqvd = false;

    try {
      const params = new URLSearchParams({ fileName: file.name, outputDir });
      const res = await fetch(`/api/qvd/convert?${params}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: await file.arrayBuffer(),
      });

      if (res.ok) {
        const data = await res.json() as {
          ok?: boolean; csv?: string; savedPath?: string;
          rowCount?: number; pyqvdMissing?: boolean; error?: string;
        };
        if (data.ok && data.csv) {
          csvText   = data.csv;
          savedPath = data.savedPath || "";
          rowCount  = data.rowCount  ?? 0;
          usedPyqvd = true;
        } else if (data.pyqvdMissing) {
          // pyqvd not installed — fall through to TypeScript parser
          console.warn("[QVD→CSV] pyqvd not found on server. Install with: pip install pyqvd");
        } else if (data.error) {
          throw new Error(data.error);
        }
      }
    } catch (serverErr) {
      // Server may be unavailable (cloud deploy) — fall through to TypeScript parser
      console.warn("[QVD→CSV] Server convert failed, falling back to TS parser:", serverErr);
    }

    // ── Attempt 2: TypeScript parser fallback ─────────────────────────────────
    if (!csvText) {
      const buffer = await file.arrayBuffer();
      const result = qvdToCSV(buffer);
      csvText  = result.csv;
      rowCount = result.rowCount;

      // Save the TypeScript-parsed CSV via the legacy save-csv endpoint
      try {
        const res = await fetch("/api/qvd/save-csv", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ csv: csvText, fileName: csvName, outputDir }),
        });
        if (res.ok) {
          const data = await res.json() as { savedPath?: string };
          savedPath = data.savedPath || "";
        }
      } catch { /* Server not available — in-memory only */ }
    }

    // ── Attempt 3: If a client-side FileSystemDirectoryHandle was selected via Browse Folder ──
    if (dirHandle && typeof dirHandle.getFileHandle === "function" && csvText) {
      try {
        const fileHandle = await dirHandle.getFileHandle(csvName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(csvText);
        await writable.close();
        if (!savedPath) {
          savedPath = `${dirHandle.name}\\${csvName}`;
        }
      } catch (fsWriteErr) {
        console.warn("[QVD→CSV] Direct write to directory handle failed:", fsWriteErr);
      }
    }

    const sizeKb = parseFloat((new Blob([csvText]).size / 1024).toFixed(2));
    const csvFile: ExtractedFile = {
      path: csvPath,
      name: csvName,
      extension: ".csv",
      sizeKb,
      text: csvText,
      parsedAsText: true,
      originPackage: file.name,
      qvdConverted: true,
      savedCsvPath: savedPath,
    };

    console.info(
      `[QVD→CSV] ${file.name}: ${rowCount} rows${usedPyqvd ? " (pyqvd)" : " (TS parser)"}${savedPath ? ` → ${savedPath}` : " (in-memory only)"}`,
    );
    return { csvFile, savedPath };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}


// ─── QVD Folder Pick Modal (Production Only) ──────────────────────────────────
// Shown ONLY when QVD files are detected in Production, before conversion runs.
function QvdFolderModal({
  qvdNames,
  onConfirm,
  onSkip,
}: {
  qvdNames: string[];
  onConfirm: (path: string, dirHandle?: any) => void;
  onSkip: () => void;
}) {
  const [selectedPath, setSelectedPath] = useState("");
  const [dirHandle, setDirHandle] = useState<any>(null);
  const [isPicking, setIsPicking] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Native File Explorer / Folder Picker
  const handleBrowseFolder = async () => {
    setIsPicking(true);
    try {
      // 1. Try modern native browser directory picker
      if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
        try {
          const handle = await (window as any).showDirectoryPicker({
            id: "qvd-output-directory",
            mode: "readwrite",
          });
          if (handle) {
            setDirHandle(handle);
            setSelectedPath(handle.name);
            toast.success(`Selected destination folder: "${handle.name}"`);
            return;
          }
        } catch (pickerErr: any) {
          if (pickerErr.name === "AbortError") {
            // User cancelled the file explorer picker
            return;
          }
          console.warn("[FolderPicker] showDirectoryPicker error, trying input fallback:", pickerErr);
        }
      }

      // 2. Fallback to hidden directory file input
      folderInputRef.current?.click();
    } finally {
      setIsPicking(false);
    }
  };

  const handleNativeFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const firstFile = files[0];
      const relativePath = (firstFile as any).webkitRelativePath || "";
      const folderName = relativePath.split("/")[0] || firstFile.name;
      setSelectedPath(folderName);
      toast.success(`Selected destination folder: "${folderName}"`);
    }
    e.target.value = "";
  };

  const handleConfirm = () => {
    if (!selectedPath.trim()) {
      toast.error("Please select a destination folder.");
      return;
    }
    onConfirm(selectedPath.trim(), dirHandle);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-teal-500/30 bg-gradient-to-br from-surface-elevated to-surface shadow-2xl p-6 space-y-5 animate-in slide-in-from-bottom-4 duration-300">
        {/* Hidden native directory input fallback */}
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore
          webkitdirectory=""
          directory=""
          onChange={handleNativeFolderInputChange}
          className="hidden"
        />

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 shrink-0 shadow-lg">
            <FolderInput className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="font-semibold text-sm text-foreground">
              QVD files detected — where should the CSVs be saved?
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {qvdNames.length === 1
                ? `1 QVD file (${qvdNames[0]}) will be converted to CSV.`
                : `${qvdNames.length} QVD files will be converted to CSV.`}
            </div>
          </div>
        </div>

        {/* Detected files list */}
        {qvdNames.length > 0 && (
          <div className="rounded-xl bg-teal-950/40 border border-teal-500/20 px-3 py-2 max-h-28 overflow-y-auto space-y-1">
            {qvdNames.map((n) => (
              <div key={n} className="flex items-center gap-2 text-[11px] font-mono text-teal-300">
                <Database className="h-3 w-3 shrink-0 text-teal-400" />
                {n}
              </div>
            ))}
          </div>
        )}

        {/* Native Folder Selection Interface */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground flex items-center justify-between">
            <span>Destination folder for converted CSVs</span>
            {selectedPath && (
              <span className="text-[10px] text-teal-400 font-normal">Folder selected</span>
            )}
          </label>

          {selectedPath ? (
            /* Selected Folder Display */
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-teal-500/50 bg-teal-950/30 text-teal-100 shadow-inner">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid place-items-center h-8 w-8 rounded-lg bg-teal-500/20 text-teal-400 shrink-0">
                  <FolderCheck className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-mono font-medium truncate text-teal-200" title={selectedPath}>
                    {selectedPath}
                  </div>
                  <div className="text-[10px] text-teal-400/70">
                    CSVs will be saved in this folder
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleBrowseFolder}
                className="shrink-0 text-xs text-teal-400 hover:text-teal-300 font-semibold px-2.5 py-1.5 rounded-lg border border-teal-500/30 hover:bg-teal-500/10 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span>Change Folder</span>
              </button>
            </div>
          ) : (
            /* No Folder Selected: Browse Folder Button with Placeholder */
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-dashed border-teal-500/40 bg-teal-950/20 hover:border-teal-400 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="grid place-items-center h-9 w-9 rounded-lg bg-teal-500/10 text-teal-400 shrink-0">
                  <FolderOpen className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground">
                    Choose an output folder
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Select a destination folder using File Explorer.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleBrowseFolder}
                disabled={isPicking}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-sm transition-all active:scale-95 shrink-0 cursor-pointer"
              >
                <FolderOpen className="h-4 w-4" />
                <span>Browse Folder</span>
              </button>
            </div>
          )}

          <div>
            {selectedPath ? (
              <p className="text-[10px] text-muted-foreground/70">
                Destination: <span className="font-mono text-teal-300">{selectedPath}</span>
              </p>
            ) : (
              <p className="text-[11px] text-amber-400/90 flex items-center gap-1.5 font-medium">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Please select a destination folder.
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            id="qvd-modal-confirm"
            onClick={handleConfirm}
            disabled={!selectedPath.trim()}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all shadow-md",
              selectedPath.trim()
                ? "bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 active:scale-95 cursor-pointer"
                : "bg-teal-800/30 text-white/40 cursor-not-allowed opacity-50 shadow-none hover:scale-100"
            )}
          >
            Convert &amp; Save Here
          </button>
          <button
            id="qvd-modal-skip"
            onClick={onSkip}
            className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent/80 text-accent-foreground text-sm font-semibold transition-all cursor-pointer"
          >
            Skip Conversion
          </button>
        </div>
      </div>
    </div>
  );
}

export function MultiFileDropzone({ onFiles, compact = false }: Props) {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const inputFolderRef = useRef<HTMLInputElement>(null);
  const inputZipRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [qvdOutputDir, setQvdOutputDir] = useQvdOutputDir();

  // Modal state: null = hidden, object = pending QVD batch waiting for user's folder selection
  const [pendingQvdModal, setPendingQvdModal] = useState<{
    qvdNames: string[];
    resolve: (result: { path: string | null; dirHandle?: any }) => void;
  } | null>(null);

  /** Ask the user for an output folder via the modal. Returns the chosen path or null if skipped. */
  function askForOutputDir(qvdNames: string[]): Promise<{ path: string | null; dirHandle?: any }> {
    return new Promise((resolve) => {
      setPendingQvdModal({ qvdNames, resolve });
    });
  }

  const processFiles = async (rawFiles: File[]) => {
    setProcessing(true);
    const result: ExtractedFile[] = [];
    try {
      // ── Pre-scan: collect QVD file names across files and ZIPs ──
      const qvdFileNames: string[] = [];
      for (const file of rawFiles) {
        const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
        if (ext === ".qvd") {
          qvdFileNames.push(file.name);
        } else if (ext === ".zip") {
          try {
            const zip = await JSZip.loadAsync(file);
            for (const [zipPath] of Object.entries(zip.files)) {
              if (zipPath.toLowerCase().endsWith(".qvd"))
                qvdFileNames.push(zipPath.split("/").pop() || zipPath);
            }
          } catch { /* ignore pre-scan errors */ }
        }
      }

      // ── If QVDs detected: show modal and wait for user's folder choice ──
      let resolvedOutputDir = "";
      let chosenDirHandle: any = null;
      if (qvdFileNames.length > 0) {
        const chosen = await askForOutputDir(qvdFileNames);
        if (chosen.path === null) {
          resolvedOutputDir = "__SKIP__"; // user skipped — don't convert
        } else {
          resolvedOutputDir = chosen.path;
          setQvdOutputDir(chosen.path);
          chosenDirHandle = chosen.dirHandle;
        }
      }

      // ── Main processing loop ──
      const result = await extractFilesFromRawList(rawFiles, resolvedOutputDir, chosenDirHandle);
      if (qvdFileNames.length > 0 && resolvedOutputDir !== "__SKIP__") {
        toast.success(`Converted ${qvdFileNames.length} QVD file(s) to CSV`, {
          description: `Saved to: ${resolvedOutputDir}`,
        });
      }
      await onFiles(result);
    } finally {
      setProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) processFiles(files);
  };

  return (
    <>
      {pendingQvdModal && (
        <QvdFolderModal
          qvdNames={pendingQvdModal.qvdNames}
          onConfirm={(path, dirHandle) => {
            setPendingQvdModal(null);
            pendingQvdModal.resolve({ path, dirHandle });
          }}
          onSkip={() => {
            setPendingQvdModal(null);
            pendingQvdModal.resolve({ path: null });
          }}
        />
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-2xl border-2 border-dashed transition-all duration-300 overflow-hidden",
          dragging ? "border-primary scale-[1.01] bg-primary/5" : "border-border bg-surface-elevated hover:border-primary/50",
        )}
      >
        {dragging && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-violet-500/10 pointer-events-none animate-pulse" />
        )}
        <div className={cn("text-center relative z-10", compact ? "px-4 sm:px-6 py-5 sm:py-6" : "px-6 py-10")}>
          <div
            className={cn(
              "grid place-items-center mx-auto shadow-md transition-all duration-300",
              compact ? "h-11 w-11 rounded-xl mb-2.5" : "h-16 w-16 rounded-2xl mb-4 shadow-lg",
              processing ? "bg-primary/20" : "bg-gradient-to-br from-primary to-violet-600"
            )}
          >
            {processing ? (
              <div className={cn("rounded-full border-white/30 border-t-white animate-spin", compact ? "h-5 w-5 border-2" : "h-7 w-7 border-[3px]")} />
            ) : (
              <Package className={cn("text-white", compact ? "h-5 w-5" : "h-7 w-7")} />
            )}
          </div>
          <div className={cn("font-display font-bold", compact ? "text-base sm:text-lg mb-0.5" : "text-xl mb-1")}>
            {processing ? "Extracting & Analysing Package…" : "Drop your Qlik project here"}
          </div>
          <div className={cn("text-muted-foreground font-mono", compact ? "text-[11px] sm:text-xs mb-3.5" : "text-xs mb-7")}>
            Single QVS · QVW + PRJ folder · ZIP package · Entire folder
          </div>
          <div className={cn("flex flex-wrap justify-center", compact ? "gap-2.5" : "gap-3")}>
            {[
              { icon: Upload, label: "Browse Files", ref: inputFileRef, cls: "bg-accent text-accent-foreground border border-border/50 hover:bg-accent/80" },
              { icon: FolderOpen, label: "Upload Folder", ref: inputFolderRef, cls: "bg-accent text-accent-foreground border border-border/50 hover:bg-accent/80" },
              { icon: Archive, label: "Upload ZIP", ref: inputZipRef, cls: "bg-gradient-to-r from-primary to-violet-600 text-white shadow-sm hover:opacity-95" },
            ].map(({ icon: Icon, label, ref, cls }) => (
              <button
                key={label}
                onClick={() => ref.current?.click()}
                className={cn(
                  "inline-flex items-center gap-1.5 font-medium transition-all active:scale-95 cursor-pointer",
                  compact ? "px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm" : "px-5 py-2.5 rounded-xl text-sm hover:opacity-90",
                  cls
                )}
              >
                <Icon className={cn(compact ? "h-3.5 w-3.5 sm:h-4 sm:w-4" : "h-4 w-4")} /> {label}
              </button>
            ))}
          </div>
        </div>
        <input ref={inputFileRef} type="file" className="hidden" multiple
          accept=".qvw,.qvs,.qvd,.qvx,.txt,.csv,.tsv,.json,.xml,.sql,.py,.ts,.js,.yaml,.yml,.md,.xlsx,.xls,.parquet,.png,.jpg,.jpeg,.webp,.pdf,.ps1,.properties"
          onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) processFiles(f); e.target.value = ""; }} />
        <input ref={inputFolderRef} type="file" className="hidden" multiple
          {...({ webkitdirectory: "" } as { webkitdirectory: string })}
          onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) processFiles(f); e.target.value = ""; }} />
        <input ref={inputZipRef} type="file" className="hidden" accept=".zip"
          onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) processFiles(f); e.target.value = ""; }} />
      </div>
    </>
  );
}


// ─── Animated stat card ───────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  value,
  label,
  gradient,
  delay = 0,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
  gradient: string;
  delay?: number;
}) {
  const count = useCounter(value, 900 + delay);
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl p-5 text-white shadow-lg",
        `bg-gradient-to-br ${gradient}`,
      )}
    >
      <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-white/10 -translate-y-8 translate-x-8 blur-xl" />
      <Icon className="h-6 w-6 mb-3 opacity-90" />
      <div className="font-display font-black text-4xl tracking-tight">{count}</div>
      <div className="text-[11px] font-medium opacity-80 mt-1 uppercase tracking-widest">
        {label}
      </div>
    </div>
  );
}

// ─── File type breakdown bar ──────────────────────────────────────────────────
function TypeBreakdown({ files }: { files: ExtractedFile[] }) {
  const groups = files.reduce<Record<string, number>>((acc, f) => {
    acc[f.extension] = (acc[f.extension] ?? 0) + 1;
    return acc;
  }, {});
  const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  const colors = [
    "bg-violet-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-sky-500",
    "bg-rose-500",
    "bg-slate-400",
  ];

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        {sorted.map(([ext, cnt], i) => (
          <div
            key={ext}
            className={cn("transition-all duration-700", colors[i % colors.length])}
            style={{ width: `${(cnt / files.length) * 100}%` }}
            title={`${ext}: ${cnt}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px]">
        {sorted.map(([ext, cnt], i) => (
          <span key={ext} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", colors[i % colors.length])} />
            <span className="font-mono font-medium">{ext}</span>
            <span className="text-muted-foreground">({cnt})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Proactive insight card ───────────────────────────────────────────────────
function InsightCard({
  icon: Icon,
  title,
  body,
  type = "info",
}: {
  icon: React.ElementType;
  title: string;
  body: string;
  type?: "info" | "warn" | "success";
}) {
  const styles = {
    info: "border-primary/20 bg-primary/5 text-primary",
    warn: "border-amber-400/30 bg-amber-400/5 text-amber-500",
    success: "border-emerald-400/30 bg-emerald-400/5 text-emerald-500",
  };
  return (
    <div className={cn("flex gap-3 p-4 rounded-xl border", styles[type])}>
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div>
        <div className="font-semibold text-xs mb-0.5">{title}</div>
        <div className="text-xs opacity-80">{body}</div>
      </div>
    </div>
  );
}

// ─── File Analysis Panel ──────────────────────────────────────────────────────
interface FileAnalysisPanelProps {
  files: ExtractedFile[];
  onToggleSource: (f: ExtractedFile) => void;
  onToggleEtl: (f: ExtractedFile) => void;
  selectedSources: ExtractedFile[];
  selectedEtls: ExtractedFile[];
}

export function FileAnalysisPanel({
  files,
  onToggleSource,
  onToggleEtl,
  selectedSources,
  selectedEtls,
}: FileAnalysisPanelProps) {
  const qvsFiles = files.filter((f) => f.extension === ".qvs");
  const csvFiles = files.filter((f) => f.extension === ".csv");
  const convertedCsvFiles = files.filter((f) => f.qvdConverted);
  const assignableFiles = files.filter((f) => f.parsedAsText); // any text file can be assigned
  const totalSize = files.reduce((s, f) => s + f.sizeKb, 0);
  const textCount = files.filter((f) => f.parsedAsText).length;

  // Build smart insights
  const insights: {
    icon: React.ElementType;
    title: string;
    body: string;
    type: "info" | "warn" | "success";
  }[] = [];
  if (qvsFiles.length >= 2)
    insights.push({
      icon: CheckCircle2,
      title: "Source + ETL scripts detected",
      body: `${qvsFiles.length} QVS files found. Auto-assigned below — verify before running analysis.`,
      type: "success",
    });
  else if (assignableFiles.length >= 2)
    insights.push({
      icon: CheckCircle2,
      title: `${assignableFiles.length} text files ready for assignment`,
      body: "Assign any two files as Source and ETL to begin analysis.",
      type: "info",
    });
  if (qvsFiles.length === 1)
    insights.push({
      icon: CheckCircle2,
      title: "Single-QVS conversion mode enabled",
      body: "The same QVS is analysed for source extraction, transformations, final tables, variables, DAX candidates and Power Query generation. No second script is required.",
      type: "success",
    });
  if (assignableFiles.length < 2 && qvsFiles.length !== 1)
    insights.push({
      icon: AlertTriangle,
      title: "No supported migration script found",
      body: "Upload one .qvs file, LoadScript.txt, or a complete ZIP/folder package.",
      type: "warn",
    });
  if (csvFiles.length > 0)
    insights.push({
      icon: Database,
      title: `${csvFiles.length} CSV data files included`,
      body: "These will be referenced as source connectors in the generated Power Query M code.",
      type: "info",
    });
  if (convertedCsvFiles.length > 0)
    insights.push({
      icon: RefreshCw,
      title: `${convertedCsvFiles.length} QVD file${convertedCsvFiles.length > 1 ? "s" : ""} auto-converted to CSV`,
      body: convertedCsvFiles
        .map((f) =>
          f.savedCsvPath
            ? `✓ ${f.name} → saved to: ${f.savedCsvPath}`
            : `✓ ${f.name} (in-memory — start local dev server to save physically)`,
        )
        .join(" | "),
      type: "success",
    });
  if (textCount > 0 && textCount === files.length)
    insights.push({
      icon: Shield,
      title: "All files parsed successfully",
      body: "100% of uploaded files are readable as text and ready for analysis.",
      type: "success",
    });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Layers}
          value={files.length}
          label="Total Files"
          gradient="from-violet-600 to-purple-700"
          delay={0}
        />
        <StatCard
          icon={FileCode2}
          value={qvsFiles.length}
          label="QVS Scripts"
          gradient="from-sky-600 to-blue-700"
          delay={100}
        />
        <StatCard
          icon={Database}
          value={csvFiles.length}
          label="Data Files"
          gradient="from-emerald-600 to-green-700"
          delay={200}
        />
        <StatCard
          icon={BarChart3}
          value={textCount}
          label="Text Parsed"
          gradient="from-amber-500 to-orange-600"
          delay={300}
        />
      </div>

      {/* ── Type breakdown ── */}
      <div className="surface-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-primary" /> File type distribution
          <span className="ml-auto text-xs text-muted-foreground font-normal font-mono">
            {totalSize.toFixed(1)} KB total
          </span>
        </div>
        <TypeBreakdown files={files} />
      </div>

      {/* ── Proactive insights ── */}
      {insights.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" /> Proactive Analysis
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {insights.map((ins, i) => (
              <InsightCard
                key={i}
                icon={ins.icon}
                title={ins.title}
                body={ins.body}
                type={ins.type}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Automatic Source & ETL Detection ── */}
      {assignableFiles.length > 0 && (
        <div className="surface-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Automatic Source &amp; ETL Detection</span>
            <span className="ml-auto text-[11px] text-muted-foreground">
              Automatically classified from uploaded file contents and extensions
            </span>
          </div>
          <div className="divide-y divide-border">
            {assignableFiles.map((f) => {
              const isSource = selectedSources.some((s) => s.path === f.path);
              const isEtl = selectedEtls.some((e) => e.path === f.path);
              const ext = f.extension?.toLowerCase() || "";
              const isDataSource = [".csv", ".tsv", ".xlsx", ".xls", ".parquet", ".qvd", ".json"].includes(ext);
              const isXmlMeta = ext === ".xml";
              const Icon = getFileIcon(f.extension);
              return (
                <div
                  key={f.path}
                  className={cn(
                    "flex items-center gap-4 px-5 py-3.5 transition-all",
                    isSource ? "bg-primary/5" : isEtl ? "bg-violet-500/5" : "hover:bg-accent/20",
                  )}
                >
                  <div
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br shrink-0",
                      getFileColor(f.extension),
                    )}
                  >
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm font-semibold truncate">{f.path}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {f.extension} · {f.sizeKb} KB
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {isSource && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-primary/15 border border-primary/30 px-2.5 py-1 text-xs font-semibold text-primary">
                        ✓ Detected: Source
                      </span>
                    )}
                    {isEtl && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-violet-500/15 border border-violet-500/30 px-2.5 py-1 text-xs font-semibold text-violet-600 dark:text-violet-400">
                        ✓ Detected: ETL
                      </span>
                    )}
                    {!isSource && !isEtl && isDataSource && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        ✓ Detected: Source Data
                      </span>
                    )}
                    {!isSource && !isEtl && isXmlMeta && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-sky-500/15 border border-sky-500/30 px-2.5 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400">
                        ✓ Detected: Qlik Metadata
                      </span>
                    )}
                    {!isSource && !isEtl && !isDataSource && !isXmlMeta && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {f.parsedAsText ? "✓ Detected: Supporting File" : "Detection Failed"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Full file table ── */}
      <div className="surface-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Files available in uploaded package</span>
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {files.length} entries
          </span>
        </div>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-surface-elevated">
                {["Path", "Extension", "Size KB", "Parsed", "Note"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-muted-foreground font-medium whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {files.map((f) => {
                const Icon = getFileIcon(f.extension);
                const isSource = selectedSources.some((s) => s.path === f.path);
                const isEtl = selectedEtls.some((e) => e.path === f.path);
                return (
                  <tr
                    key={f.path}
                    className={cn(
                      "transition-colors",
                      isSource ? "bg-primary/5" : isEtl ? "bg-violet-500/5" : "hover:bg-accent/10",
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={cn(
                            "grid h-5 w-5 shrink-0 place-items-center rounded bg-gradient-to-br",
                            getFileColor(f.extension),
                          )}
                        >
                          <Icon className="h-2.5 w-2.5 text-white" />
                        </div>
                        <span className="font-mono truncate max-w-[240px] text-foreground">
                          {isSource && <span className="text-primary font-bold mr-1">[SRC]</span>}
                          {isEtl && <span className="text-violet-500 font-bold mr-1">[ETL]</span>}
                          {f.path}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "font-mono px-2 py-0.5 rounded-full text-[10px] font-semibold text-white bg-gradient-to-r",
                          getFileColor(f.extension),
                        )}
                      >
                        {f.extension}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{f.sizeKb}</td>
                    <td className="px-4 py-2.5">
                      {f.parsedAsText ? (
                        <span className="inline-flex items-center gap-1 text-emerald-500">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="inline-block h-3 w-3 rounded-full bg-muted border border-border" />
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground/60 italic">
                      {f.qvdConverted && f.savedCsvPath ? (
                        <span className="inline-flex items-center gap-1 text-teal-400 font-mono text-[10px]">
                          <Download className="h-3 w-3" />
                          {f.savedCsvPath}
                        </span>
                      ) : f.qvdConverted ? (
                        <span className="inline-flex items-center gap-1 text-teal-300 text-[10px]">
                          <RefreshCw className="h-3 w-3" /> Auto-converted from QVD
                        </span>
                      ) : !f.parsedAsText ? "Binary — retained in inventory" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
