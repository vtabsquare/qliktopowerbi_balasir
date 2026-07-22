import type { PowerBiModelState } from "../model";
import type { QvwAnalysis } from "../qvw";

export type ReportGenerationMode = "qlik-fidelity" | "ai-360" | "hybrid";
export type ReportPagePurpose = "landing" | "executive-summary" | "trend" | "dimension" | "variance" | "detail" | "diagnostic" | "drillthrough" | "tooltip";

export interface PlannedBinding {
  role: string;
  table: string;
  field?: string;
  measure?: string;
  queryRef: string;
  kind: "column" | "measure";
}

export interface PlannedVisual {
  id: string;
  title: string;
  visualType: string;
  analyticalIntent: string;
  bindings: PlannedBinding[];
  x: number;
  y: number;
  width: number;
  height: number;
  source: "qlik" | "powerbi-enhancement";
  confidence: number;
}

export interface PlannedPage {
  id: string;
  displayName: string;
  purpose: ReportPagePurpose;
  hidden: boolean;
  width: number;
  height: number;
  visuals: PlannedVisual[];
}

export interface ReportPlan {
  version: "1.0";
  generationMode: ReportGenerationMode;
  reportTitle: string;
  pages: PlannedPage[];
  detectedDomains: string[];
  kpis: { table: string; measure: string; confidence: number }[];
  dimensions: { table: string; column: string; confidence: number }[];
  warnings: string[];
  qlikCoverage: number;
  powerBiEnhancementCount: number;
}

const clean = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "item";
const qref = (table: string, field: string) => `${table}.${field}`;

function likelyDate(name: string, dataType: string) {
  return /date|time|month|year|quarter|week/i.test(name) || /date|time/i.test(dataType);
}
function likelyDimension(name: string, dataType: string) {
  if (/id$|key$|code$/i.test(name)) return false;
  return /text|string/i.test(dataType) || /name|region|country|product|customer|category|department|status|channel|supplier|employee/i.test(name);
}
function likelyKpi(name: string) {
  return /sales|revenue|profit|margin|amount|quantity|count|orders|budget|forecast|target|inventory|cost|headcount|balance|variance/i.test(name);
}

function discover(model: PowerBiModelState) {
  const measures = model.tables.flatMap((table) => table.measures.filter((m) => !m.hidden).map((m) => ({ table, measure: m })));
  const columns = model.tables.flatMap((table) => table.columns.filter((c) => !c.hidden).map((c) => ({ table, column: c })));
  const preferredMeasures = [...measures].sort((a, b) => Number(likelyKpi(b.measure.name)) - Number(likelyKpi(a.measure.name)));
  const dates = columns.filter(({ column }) => likelyDate(column.name, column.dataType));
  const dimensions = columns.filter(({ column }) => likelyDimension(column.name, column.dataType));
  return { preferredMeasures, dates, dimensions, columns };
}

function visual(id: string, title: string, visualType: string, intent: string, bindings: PlannedBinding[], x: number, y: number, width: number, height: number, source: PlannedVisual["source"] = "powerbi-enhancement"): PlannedVisual {
  return { id: clean(id), title, visualType, analyticalIntent: intent, bindings, x, y, width, height, source, confidence: bindings.length ? 0.92 : 0.55 };
}

function mb(table: string, measure: string, role = "Y"): PlannedBinding {
  return { role, table, measure, queryRef: qref(table, measure), kind: "measure" };
}
function cb(table: string, field: string, role = "Category"): PlannedBinding {
  return { role, table, field, queryRef: qref(table, field), kind: "column" };
}

function build360Pages(model: PowerBiModelState): PlannedPage[] {
  const { preferredMeasures, dates, dimensions, columns } = discover(model);
  const primary = preferredMeasures.slice(0, 6);
  const primaryMeasure = preferredMeasures[0];
  const date = dates[0];
  const dimension = dimensions[0];
  const secondaryDimension = dimensions[1] || dimension;
  const pages: PlannedPage[] = [];

  pages.push({ id: "AI360_Landing", displayName: "Home", purpose: "landing", hidden: false, width: 1280, height: 720, visuals: [
    visual("title", model.projectName || "Power BI Migration Report", "textbox", "Report title and navigation landing area", [], 40, 35, 1200, 70),
    visual("model_status", "Model Readiness", "card", "Show model validation readiness", primaryMeasure ? [mb(primaryMeasure.table.name, primaryMeasure.measure.name)] : [], 40, 135, 280, 120),
  ]});

  const execVisuals: PlannedVisual[] = primary.map((item, index) => visual(`kpi_${index}`, item.measure.name, "card", `Executive KPI for ${item.measure.name}`, [mb(item.table.name, item.measure.name)], 40 + (index % 4) * 300, 80 + Math.floor(index / 4) * 150, 275, 125));
  if (primaryMeasure && date) execVisuals.push(visual("main_trend", `${primaryMeasure.measure.name} Trend`, "lineChart", "Time trend", [cb(date.table.name, date.column.name), mb(primaryMeasure.table.name, primaryMeasure.measure.name)], 40, 390, 760, 280));
  if (primaryMeasure && dimension) execVisuals.push(visual("top_dimension", `${primaryMeasure.measure.name} by ${dimension.column.name}`, "clusteredBarChart", "Top dimensional contributors", [cb(dimension.table.name, dimension.column.name), mb(primaryMeasure.table.name, primaryMeasure.measure.name)], 830, 390, 410, 280));
  pages.push({ id: "AI360_Executive", displayName: "Executive Overview", purpose: "executive-summary", hidden: false, width: 1280, height: 720, visuals: execVisuals });

  if (primaryMeasure && date) pages.push({ id: "AI360_Trend", displayName: "Trend Analysis", purpose: "trend", hidden: false, width: 1280, height: 720, visuals: [
    visual("trend_primary", `${primaryMeasure.measure.name} over Time`, "lineChart", "Primary KPI trend and period comparison", [cb(date.table.name, date.column.name), mb(primaryMeasure.table.name, primaryMeasure.measure.name)], 40, 90, 780, 560),
    ...(secondaryDimension ? [visual("trend_breakdown", `Trend by ${secondaryDimension.column.name}`, "clusteredColumnChart", "Break down trend by a major dimension", [cb(secondaryDimension.table.name, secondaryDimension.column.name), mb(primaryMeasure.table.name, primaryMeasure.measure.name)], 850, 90, 390, 270)] : []),
  ]});

  if (primaryMeasure && dimension) pages.push({ id: "AI360_Dimension", displayName: "Dimensional Performance", purpose: "dimension", hidden: false, width: 1280, height: 720, visuals: [
    visual("dimension_bar", `${primaryMeasure.measure.name} by ${dimension.column.name}`, "clusteredBarChart", "Rank dimensional performance", [cb(dimension.table.name, dimension.column.name), mb(primaryMeasure.table.name, primaryMeasure.measure.name)], 40, 90, 760, 560),
    visual("dimension_slicer", dimension.column.name, "slicer", "Interactive dimensional filter", [cb(dimension.table.name, dimension.column.name, "Values")], 830, 90, 410, 250),
  ]});

  const detailBindings = columns.slice(0, 8).map(({ table, column }) => cb(table.name, column.name, "Values"));
  if (detailBindings.length) pages.push({ id: "AI360_Detail", displayName: "Detail Analysis", purpose: "detail", hidden: false, width: 1280, height: 720, visuals: [
    visual("detail_table", "Detailed Records", "tableEx", "Export-ready detailed analysis", detailBindings, 40, 90, 1200, 560),
  ]});

  pages.push({ id: "AI360_DataQuality", displayName: "Data Quality & Migration", purpose: "diagnostic", hidden: false, width: 1280, height: 720, visuals: [
    visual("dq_summary", "Migration Readiness", "tableEx", "Technical validation and migration audit", [], 40, 90, 1200, 560),
  ]});
  return pages;
}

export function buildProfessionalReportPlan(model: PowerBiModelState, qvw?: QvwAnalysis | null): ReportPlan {
  const qlikSheets = qvw?.sheets.filter((s) => s.id !== "UNASSIGNED") || [];
  const qlikVisualCount = model.visualBindings.length;
  const pages = build360Pages(model);
  const discovered = discover(model);
  const mode: ReportGenerationMode = qlikSheets.length && qlikVisualCount ? "hybrid" : "ai-360";
  const domains = new Set<string>();
  for (const table of model.tables) {
    const text = `${table.name} ${table.columns.map((c) => c.name).join(" ")}`;
    for (const [pattern, domain] of [[/sales|order|revenue/i, "Sales"], [/customer/i, "Customer"], [/product|inventory/i, "Product & Inventory"], [/budget|forecast|target/i, "Planning"], [/employee|department|headcount/i, "Workforce"], [/case|incident|ticket/i, "Operations"]] as const) if (pattern.test(text)) domains.add(domain);
  }
  return {
    version: "1.0",
    generationMode: mode,
    reportTitle: model.projectName || "Power BI Migration Report",
    pages,
    detectedDomains: [...domains],
    kpis: discovered.preferredMeasures.slice(0, 12).map(({ table, measure }) => ({ table: table.name, measure: measure.name, confidence: likelyKpi(measure.name) ? 0.95 : 0.7 })),
    dimensions: discovered.dimensions.slice(0, 12).map(({ table, column }) => ({ table: table.name, column: column.name, confidence: 0.9 })),
    warnings: qlikSheets.length ? [] : ["No reliable Qlik UI metadata was found. The 360-degree report was inferred from the semantic model."],
    qlikCoverage: qlikVisualCount ? 100 : 0,
    powerBiEnhancementCount: pages.reduce((sum, p) => sum + p.visuals.length, 0),
  };
}
