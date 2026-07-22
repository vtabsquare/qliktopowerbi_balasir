export type QlikPlatform = "QlikView" | "QlikSense" | "QlikCloud" | "Mixed" | "Unknown";
export type PackageType =
  | "ScriptOnly" | "QlikViewApplication" | "QlikViewProject" | "QlikSenseApplication"
  | "QvdPackage" | "SourceDataPackage" | "MetadataPackage" | "DatabaseLogicPackage"
  | "VisualMetadataPackage" | "SecurityPackage" | "OperationalPackage" | "PowerBITargetPackage"
  | "FullEnterprisePackage" | "MixedPartialPackage";
export type Completeness = "Complete" | "SubstantiallyComplete" | "Partial" | "MetadataOnly" | "DataOnly" | "Insufficient";

export interface ClassifiableArtifact {
  path: string; name: string; extension: string; sizeKb: number; text: string | null; parsedAsText: boolean;
}
export interface DetectedArtifact {
  path: string; name: string; extension: string; role: string; platform: QlikPlatform; required: boolean;
  parsed: boolean; warnings: string[];
}
export interface ReadinessScore { key: string; label: string; score: number; reason: string; }
export interface UploadClassificationResult {
  platform: QlikPlatform; packageType: PackageType; completeness: Completeness;
  detectedArtifacts: DetectedArtifact[]; capabilities: string[]; missingInputs: string[];
  warnings: string[]; selectedRoute: string; routeReason: string; confidence: number;
  readiness: ReadinessScore[]; blockingIssues: string[];
}

const sourceExt = new Set([".csv", ".tsv", ".txt", ".xlsx", ".xls", ".json", ".xml", ".parquet", ".avro", ".orc", ".mdb", ".accdb", ".dbf", ".sqlite", ".db"]);
const powerBiExt = new Set([".pbip", ".pbix", ".pbit", ".bim", ".tmdl"]);
const visualExt = new Set([".png", ".jpg", ".jpeg", ".svg", ".pdf", ".qext"]);

function pathText(file: ClassifiableArtifact) { return `${file.path || file.name}\n${file.text || ""}`.toLowerCase(); }
function isPrj(file: ClassifiableArtifact) {
  const p = file.path.replace(/\\/g, "/");
  return /(?:^|\/)[^/]+-prj(?:\/|$)/i.test(p) || /(?:docproperties|docinternals|allproperties|toplayout|loadscript|module)\.(?:xml|txt)$/i.test(p) || /(?:^|\/)(?:sh|ch|lb|tx|bu|ib|sl|ct|mb|cs|ext)[a-z0-9_-]*\.xml$/i.test(p);
}
function roleFor(file: ClassifiableArtifact): string {
  const ext = file.extension.toLowerCase(); const t = pathText(file);
  if (ext === ".qvw") return "QlikView application";
  if (ext === ".qvf") return "Qlik Sense application";
  if (isPrj(file)) return "QVW PRJ metadata";
  if (ext === ".qvs" || /\b(load|resident|mapping load|section access)\b/.test(t)) return /section access/.test(t) ? "Security script" : "Qlik script";
  if (ext === ".qvd") return "QVD data artifact";
  if (ext === ".qvx") return "QVX exchange artifact";
  if (ext === ".sql" || /\b(create\s+(procedure|view|function)|sql select)\b/.test(t)) return "Database logic";
  if (powerBiExt.has(ext)) return "Power BI target asset";
  if (/reload|publisher|scheduler|qmc|execution log|document log/.test(t) || ext === ".log") return "Operational metadata";
  if (visualExt.has(ext)) return "Visual/layout evidence";
  if (sourceExt.has(ext)) return "Source data";
  if ([".json", ".xml", ".xlsx", ".csv"].includes(ext)) return "Metadata";
  return "Supporting artifact";
}

export function classifyUploadedArtifacts(files: ClassifiableArtifact[]): UploadClassificationResult {
  const artifacts = files.map((f): DetectedArtifact => ({
    path: f.path, name: f.name, extension: f.extension.toLowerCase(), role: roleFor(f),
    platform: f.extension.toLowerCase() === ".qvf" ? "QlikSense" : (f.extension.toLowerCase() === ".qvw" || isPrj(f)) ? "QlikView" : "Unknown",
    required: ["Qlik script", "QlikView application", "Qlik Sense application", "QVW PRJ metadata"].includes(roleFor(f)),
    parsed: f.parsedAsText || [".qvw", ".qvf", ".qvd", ".qvx", ".pbix", ".pbit"].includes(f.extension.toLowerCase()), warnings: [],
  }));
  const roles = new Set(artifacts.map(a => a.role));
  const hasQvw = roles.has("QlikView application"), hasPrj = roles.has("QVW PRJ metadata"), hasQvf = roles.has("Qlik Sense application");
  const hasScript = roles.has("Qlik script") || roles.has("Security script"), hasQvd = roles.has("QVD data artifact");
  const hasSource = roles.has("Source data"), hasVisual = roles.has("Visual/layout evidence") || hasPrj;
  const hasSql = roles.has("Database logic"), hasSecurity = roles.has("Security script"), hasOps = roles.has("Operational metadata"), hasPbi = roles.has("Power BI target asset");
  const platforms = new Set<QlikPlatform>(); if (hasQvw || hasPrj) platforms.add("QlikView"); if (hasQvf) platforms.add("QlikSense");
  const platform: QlikPlatform = platforms.size > 1 ? "Mixed" : [...platforms][0] || (hasScript || hasQvd ? "Unknown" : "Unknown");

  const categories = [hasScript || hasQvw || hasQvf, hasQvd, hasSource, hasVisual, hasSql, hasSecurity, hasOps, hasPbi].filter(Boolean).length;
  let packageType: PackageType;
  if ((hasQvw || hasQvf) && hasScript && hasSource && hasVisual) packageType = "FullEnterprisePackage";
  else if (hasQvw && hasPrj) packageType = "QlikViewProject";
  else if (hasQvw) packageType = "QlikViewApplication";
  else if (hasQvf) packageType = "QlikSenseApplication";
  else if (hasScript && categories === 1) packageType = "ScriptOnly";
  else if (hasQvd && categories === 1) packageType = "QvdPackage";
  else if (hasSource && categories === 1) packageType = "SourceDataPackage";
  else if (hasSql && categories === 1) packageType = "DatabaseLogicPackage";
  else if (hasVisual && categories === 1) packageType = "VisualMetadataPackage";
  else if (hasSecurity && categories === 1) packageType = "SecurityPackage";
  else if (hasOps && categories === 1) packageType = "OperationalPackage";
  else if (hasPbi && categories === 1) packageType = "PowerBITargetPackage";
  else packageType = "MixedPartialPackage";

  const missingInputs: string[] = [], warnings: string[] = [], blockingIssues: string[] = [];
  if (hasScript && !hasSource && !hasQvd) missingInputs.push("Source files or source-connection mappings for refresh and schema validation");
  if ((hasQvw || hasQvf) && !hasVisual && !hasPrj) missingInputs.push("Readable visual metadata (PRJ or Engine API export)");
  if (hasQvd && !hasScript) warnings.push("QVD producer logic is unavailable; original transformation lineage cannot be verified.");
  if (hasVisual && !hasScript && !hasQvw && !hasQvf) warnings.push("Visual evidence can guide layout only; calculations cannot be certified.");
  if (files.length === 0) blockingIssues.push("No artifacts were uploaded.");
  if (!hasScript && !hasQvw && !hasQvf && !hasQvd && !hasSource && !hasSql && !hasPbi) blockingIssues.push("No recognized executable migration input was detected.");

  const readiness: ReadinessScore[] = [
    { key: "etl", label: "ETL migration", score: hasScript ? 90 : hasQvd ? 45 : 10, reason: hasScript ? "Executable Qlik script detected" : hasQvd ? "Materialized data only" : "No ETL script detected" },
    { key: "model", label: "Data model", score: (hasScript || hasQvw || hasQvf) ? 80 : hasQvd ? 45 : 15, reason: "Based on available script/application metadata" },
    { key: "dax", label: "DAX", score: hasVisual && (hasQvw || hasQvf || hasPrj) ? 80 : hasScript ? 45 : 10, reason: hasVisual ? "Visual context available" : "Visual context is incomplete" },
    { key: "visual", label: "Visual migration", score: hasVisual ? 85 : 5, reason: hasVisual ? "Visual metadata/evidence detected" : "No visual metadata detected" },
    { key: "security", label: "Security", score: hasSecurity ? 70 : 5, reason: hasSecurity ? "Security logic detected; review required" : "No security metadata detected" },
    { key: "validation", label: "Reconciliation", score: hasSource ? 65 : 15, reason: hasSource ? "Source data available for profiling" : "No source data supplied" },
  ];
  const core = readiness.filter(r => ["etl", "model"].includes(r.key));
  const confidence = Math.round(core.reduce((s, r) => s + r.score, 0) / core.length);
  const completeness: Completeness = packageType === "FullEnterprisePackage" ? "SubstantiallyComplete" : hasScript && hasSource ? "SubstantiallyComplete" : hasSource && !hasScript ? "DataOnly" : hasVisual && !hasScript ? "MetadataOnly" : blockingIssues.length ? "Insufficient" : "Partial";
  const capabilities = [hasScript && "ETL conversion", hasSource && "Data profiling", hasQvd && "QVD lineage/materialized migration", (hasQvw || hasQvf || hasPrj) && "Application metadata analysis", hasVisual && "Visual conversion", hasSecurity && "Security review", hasOps && "Refresh/orchestration analysis", hasPbi && "Existing Power BI target merge"].filter(Boolean) as string[];
  const selectedRoute = ({ ScriptOnly: "Script-only ETL migration", QlikViewProject: "Full QlikView project migration", QlikViewApplication: "QlikView application migration", QlikSenseApplication: "Qlik Sense application migration", QvdPackage: "QVD materialized-data migration", SourceDataPackage: "Source profiling and mapping", DatabaseLogicPackage: "Database logic conversion", VisualMetadataPackage: "Visual redesign assistance", SecurityPackage: "Security conversion review", OperationalPackage: "Reload and orchestration migration", PowerBITargetPackage: "Power BI target inspection", FullEnterprisePackage: "Full enterprise migration", MixedPartialPackage: "Mixed-artifact guided migration" } as Record<PackageType,string>)[packageType];
  return { platform, packageType, completeness, detectedArtifacts: artifacts, capabilities, missingInputs, warnings, selectedRoute, routeReason: `Detected ${files.length} artifact(s) across ${categories || 1} input category/categories.`, confidence, readiness, blockingIssues };
}
