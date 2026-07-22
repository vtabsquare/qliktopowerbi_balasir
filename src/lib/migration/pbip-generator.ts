import JSZip from "jszip";
import type { EnterpriseAnalysis } from "./enterprise-parser";
import { assertCompilerInvariants, compileAuthoritatively, compilerFingerprint } from "./QlikCompilerService";
import type { ExpressionInventory } from "./expression";
import type { PowerBiModelState } from "./model";
import type { QvwAnalysis } from "./qvw";
import { buildProfessionalReportPlan, type PlannedVisual } from "./report-designer";
import { deepValidatePowerQueries } from "./power-query/MQueryDeepValidator";
import {
  buildTomDatabaseSpec,
  hasBlockingTmdlDiagnostics,
  serializeTomModel,
  type TmdlFolderResult,
} from "./tmdl";

export interface PbipEnhancements {
  expressionInventory?: ExpressionInventory | null;
  powerBiModel?: PowerBiModelState | null;
  qvwAnalysis?: QvwAnalysis | null;
  pipelineLogs?: string[];
  preferMicrosoftTom?: boolean;
  requireMicrosoftTom?: boolean;
}

function uuidv4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (Number(char) ^ (Math.floor(Math.random() * 256) & (15 >> (Number(char) / 4)))).toString(16),
  );
}

function safeProjectName(value: string): string {
  return (value || "QLIK2PBI_Migration")
    .replace(/[^A-Za-z0-9 _-]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "QLIK2PBI_Migration";
}

function safeReportObjectName(value: string, fallback: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_-]/g, "_").replace(/^_+|_+$/g, "");
  return sanitized || fallback;
}

function safeMigrationFileName(value: string, fallback: string): string {
  const sanitized = String(value || "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return sanitized || fallback;
}

function reportPages(qvw?: QvwAnalysis | null) {
  const sheets = qvw?.sheets.filter((sheet) => sheet.id !== "UNASSIGNED") || [];
  const source = sheets.length ? sheets : [{ id: "ReportSection", name: "Migration Review", order: 0, objectIds: [] } as any];
  const used = new Set<string>();
  return source.map((sheet, index) => {
    let name = safeReportObjectName(String(sheet.id || ""), `ReportSection${String(index).padStart(4, "0")}`);
    let suffix = 2;
    const base = name;
    while (used.has(name.toLocaleLowerCase())) name = `${base}_${suffix++}`;
    used.add(name.toLocaleLowerCase());
    return {
      name,
      displayName: sheet.name || `Page ${index + 1}`,
      ordinal: index,
      width: 1280,
      height: 720,
    };
  });
}

function pbirVisualType(target: string): string {
  const value = String(target || "").toLowerCase();
  if (value.includes("matrix")) return "pivotTable";
  if (value.includes("table")) return "tableEx";
  if (value.includes("line and") || value.includes("combo")) return "lineClusteredColumnComboChart";
  if (value.includes("line")) return "lineChart";
  if (value.includes("stacked") && value.includes("bar")) return "barChart";
  if (value.includes("stacked") && value.includes("column")) return "columnChart";
  if (value.includes("bar")) return "clusteredBarChart";
  if (value.includes("column")) return "clusteredColumnChart";
  if (value.includes("pie")) return "pieChart";
  if (value.includes("donut")) return "donutChart";
  if (value.includes("scatter")) return "scatterChart";
  if (value.includes("gauge")) return "gauge";
  if (value.includes("kpi")) return "kpi";
  if (value.includes("card")) return "card";
  if (value.includes("slicer")) return "slicer";
  return "tableEx";
}

function resolveVisualField(model: PowerBiModelState | null | undefined, objectId: string, kind: "column" | "measure") {
  if (!model) return null;
  for (const table of model.tables) {
    const collection = kind === "column" ? table.columns : table.measures;
    const item = collection.find((candidate) => candidate.id === objectId);
    if (item) return { table: table.name, name: item.name };
  }
  return null;
}

function fieldQueryRef(table: string, name: string): string {
  // PBIR projection metadata uses the semantic query name (Table.Field).
  // Keep the value stable and identical across queryState projections, selectors,
  // sort definitions and future formatting metadata.
  return `${table}.${name}`;
}

function fieldProjection(table: string, name: string, kind: "column" | "measure") {
  const field = kind === "measure"
    ? { Measure: { Expression: { SourceRef: { Entity: table } }, Property: name } }
    : { Column: { Expression: { SourceRef: { Entity: table } }, Property: name } };
  return {
    field,
    queryRef: fieldQueryRef(table, name),
  };
}

function validateVisualQueryState(visualJson: any, visualPath: string): void {
  const queryState = visualJson?.visual?.query?.queryState;
  if (!queryState || typeof queryState !== "object") return;
  const failures: string[] = [];
  for (const [role, roleState] of Object.entries(queryState as Record<string, any>)) {
    const roleProjections = Array.isArray(roleState?.projections) ? roleState.projections : [];
    roleProjections.forEach((projection: any, index: number) => {
      const queryRef = typeof projection?.queryRef === "string" ? projection.queryRef.trim() : "";
      if (!queryRef) failures.push(`${role}.projections[${index}] is missing queryRef`);
      const semanticField = projection?.field?.Column || projection?.field?.Measure;
      const entity = semanticField?.Expression?.SourceRef?.Entity;
      const property = semanticField?.Property;
      if (!entity || !property) failures.push(`${role}.projections[${index}] has an incomplete semantic field binding`);
      if (queryRef && entity && property && queryRef !== fieldQueryRef(String(entity), String(property))) {
        failures.push(`${role}.projections[${index}] queryRef '${queryRef}' does not match '${fieldQueryRef(String(entity), String(property))}'`);
      }
    });
  }
  if (failures.length) {
    throw new Error(`PBIR visual validation failed for ${visualPath}:\n${failures.join("\n")}`);
  }
}

function visualRoles(visualType: string) {
  if (visualType === "slicer") return { dimension: "Values", measure: "Values" };
  if (["tableEx", "pivotTable"].includes(visualType)) return { dimension: "Values", measure: "Values" };
  if (["card", "kpi", "gauge"].includes(visualType)) return { dimension: "Category", measure: "Y" };
  if (["pieChart", "donutChart"].includes(visualType)) return { dimension: "Category", measure: "Y" };
  if (visualType === "scatterChart") return { dimension: "Details", measure: "Y" };
  return { dimension: "Category", measure: "Y" };
}

function buildVisualJson(binding: any, model: PowerBiModelState | null | undefined, qvw: QvwAnalysis | null | undefined, index: number) {
  const sourceObject = qvw?.objects.find((object) => object.id === binding.objectId);
  const visualType = pbirVisualType(binding.targetVisual || sourceObject?.powerBiVisual || sourceObject?.type);
  const roles = visualRoles(visualType);
  const projections: Record<string, any> = {};
  const add = (role: string, projection: any) => {
    if (!projections[role]) projections[role] = { projections: [] };
    projections[role].projections.push(projection);
  };
  for (const id of binding.dimensionIds || []) {
    const field = resolveVisualField(model, id, "column");
    if (field) add(roles.dimension, fieldProjection(field.table, field.name, "column"));
  }
  for (const id of binding.measureIds || []) {
    const field = resolveVisualField(model, id, "measure");
    if (field) add(roles.measure, fieldProjection(field.table, field.name, "measure"));
  }
  const layout = sourceObject?.layout || {};
  const x = Number.isFinite(layout.x) ? Math.max(0, Number(layout.x)) : 30 + (index % 2) * 610;
  const y = Number.isFinite(layout.y) ? Math.max(60, Number(layout.y)) : 80 + Math.floor(index / 2) * 290;
  const width = Number.isFinite(layout.width) ? Math.max(180, Number(layout.width)) : 570;
  const height = Number.isFinite(layout.height) ? Math.max(120, Number(layout.height)) : 250;
  const title = binding.objectTitle || sourceObject?.title || `${binding.originalObjectType || "Qlik"} visual`;
  return {
    $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.5.0/schema.json",
    name: safeReportObjectName(binding.id || binding.objectId, `visual_${index + 1}`),
    position: { x, y, z: Number(layout.zIndex || index), height, width, tabOrder: index },
    visual: {
      visualType,
      query: { queryState: projections },
      drillFilterOtherVisuals: true,
      visualContainerObjects: {
        title: [{ properties: {
          show: { expr: { Literal: { Value: "true" } } },
          text: { expr: { Literal: { Value: `'${String(title).replace(/'/g, "''")}'` } } },
        } }],
        subTitle: [{ properties: {
          show: { expr: { Literal: { Value: "false" } } },
        } }],
      },
    },
    filterConfig: { filters: [] },
    annotations: [
      { name: "QlikMigration.SourceObjectId", value: String(binding.objectId || "") },
      { name: "QlikMigration.Status", value: String(binding.status || "unknown") },
    ],
  };
}

function buildPlannedVisualJson(item: PlannedVisual, index: number) {
  const projections: Record<string, any> = {};
  for (const binding of item.bindings) {
    if (!projections[binding.role]) projections[binding.role] = { projections: [] };
    projections[binding.role].projections.push(fieldProjection(binding.table, binding.field || binding.measure || "", binding.kind));
  }
  return {
    $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.5.0/schema.json",
    name: safeReportObjectName(item.id, `planned_visual_${index + 1}`),
    position: { x: item.x, y: item.y, z: index, height: item.height, width: item.width, tabOrder: index },
    visual: {
      visualType: pbirVisualType(item.visualType),
      query: { queryState: projections },
      drillFilterOtherVisuals: true,
      visualContainerObjects: {
        title: [{ properties: {
          show: { expr: { Literal: { Value: "true" } } },
          text: { expr: { Literal: { Value: `'${String(item.title).replace(/'/g, "''")}'` } } },
        } }],
      },
    },
    filterConfig: { filters: [] },
    annotations: [
      { name: "QlikMigration.Source", value: item.source },
      { name: "QlikMigration.AnalyticalIntent", value: item.analyticalIntent },
      { name: "QlikMigration.Confidence", value: String(item.confidence) },
    ],
  };
}

function writePbirReport(reportFolder: JSZip, semanticModelFolderName: string, qvw?: QvwAnalysis | null, model?: PowerBiModelState | null): void {
  const qlikPages = reportPages(qvw);
  if (!qlikPages.length) throw new Error("PBIR generation requires at least one report page.");
  const professionalPlan = model ? buildProfessionalReportPlan(model, qvw) : null;
  const generatedPages = professionalPlan?.pages.map((page, index) => ({
    name: safeReportObjectName(page.id, `AI360_${index + 1}`),
    displayName: page.displayName,
    ordinal: qlikPages.length + index,
    width: page.width,
    height: page.height,
    plannedPage: page,
  })) || [];
  const pages = [...qlikPages, ...generatedPages];

  reportFolder.file("definition.pbir", JSON.stringify({
    $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json",
    version: "4.0",
    datasetReference: { byPath: { path: `../${semanticModelFolderName}` } },
  }, null, 2));

  const definition = reportFolder.folder("definition");
  if (!definition) throw new Error("Failed to create the PBIR definition folder.");
  definition.file("version.json", JSON.stringify({
    $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json",
    version: "2.0.0",
  }, null, 2));
  definition.file("report.json", JSON.stringify({
    $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.1.0/schema.json",
    themeCollection: {
      baseTheme: {
        name: "CY25SU12",
        reportVersionAtImport: { visual: "2.5.0", report: "3.1.0", page: "2.3.0" },
        type: "SharedResources",
      },
    },
    settings: {
      useStylableVisualContainerHeader: true,
      defaultFilterActionIsDataFilter: true,
      defaultDrillFilterOtherVisuals: true,
      allowChangeFilterTypes: true,
      allowInlineExploration: true,
      useEnhancedTooltips: true,
    },
    annotations: [{ name: "QlikMigration.Generated", value: "true" }],
  }, null, 2));

  const pagesFolder = definition.folder("pages");
  if (!pagesFolder) throw new Error("Failed to create the PBIR pages folder.");
  pagesFolder.file("pages.json", JSON.stringify({
    $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.1.0/schema.json",
    pageOrder: pages.map((page) => page.name),
    activePageName: pages[0].name,
  }, null, 2));
  for (const page of pages) {
    const pageFolder = pagesFolder.folder(page.name);
    if (!pageFolder) throw new Error(`Failed to create PBIR page '${page.name}'.`);
    pageFolder.file("page.json", JSON.stringify({
      $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.0.0/schema.json",
      name: page.name,
      displayName: page.displayName,
      displayOption: "FitToPage",
      height: page.height,
      width: page.width,
      annotations: [{ name: "QlikMigration.Generated", value: "true" }],
    }, null, 2));
    const visualsFolder = pageFolder.folder("visuals");
    const bindings = (model?.visualBindings || []).filter((binding) =>
      binding.sheetId ? binding.sheetId === (qvw?.sheets.find((sheet) => safeReportObjectName(String(sheet.id || ""), "") === page.name)?.id) : page.ordinal === 0,
    );
    bindings.forEach((binding, visualIndex) => {
      const visualName = safeReportObjectName(binding.id || binding.objectId, `visual_${visualIndex + 1}`);
      const visualFolder = visualsFolder?.folder(visualName);
      const visualJson = buildVisualJson(binding, model, qvw, visualIndex);
      validateVisualQueryState(visualJson, `${page.name}/visuals/${visualName}/visual.json`);
      visualFolder?.file("visual.json", JSON.stringify(visualJson, null, 2));
    });
    const plannedPage = (page as any).plannedPage;
    if (plannedPage) {
      plannedPage.visuals.filter((item: PlannedVisual) => item.bindings.length > 0).forEach((item: PlannedVisual, plannedIndex: number) => {
        const visualName = safeReportObjectName(item.id, `planned_visual_${plannedIndex + 1}`);
        const visualFolder = visualsFolder?.folder(visualName);
        const visualJson = buildPlannedVisualJson(item, bindings.length + plannedIndex);
        validateVisualQueryState(visualJson, `${page.name}/visuals/${visualName}/visual.json`);
        visualFolder?.file("visual.json", JSON.stringify(visualJson, null, 2));
      });
    }
  }
}

function writeTmdlFolder(semanticFolder: JSZip, result: TmdlFolderResult): void {
  const definition = semanticFolder.folder("definition");
  if (!definition) throw new Error("Failed to create the TMDL definition folder.");
  for (const [relativePath, content] of Object.entries(result.files)) {
    definition.file(relativePath.replace(/\\/g, "/"), content);
  }
}

function semanticModelDefinitionProperties() {
  return {
    $schema: "https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json",
    version: "4.0",
    settings: {},
  };
}

function assertTmdlReady(result: TmdlFolderResult): void {
  const required = ["database.tmdl", "model.tmdl"];
  for (const requiredFile of required) {
    if (!result.files[requiredFile]?.trim()) throw new Error(`TMDL serialization did not create ${requiredFile}.`);
  }
  if (!Object.keys(result.files).some((name) => name.startsWith("tables/") && name.endsWith(".tmdl"))) {
    throw new Error("TMDL serialization did not create any table definitions.");
  }
  if (hasBlockingTmdlDiagnostics(result.diagnostics)) {
    const details = result.diagnostics
      .filter((item) => item.severity === "blocking-error")
      .map((item) => `${item.code} at ${item.objectPath}: ${item.message}`)
      .join("\n");
    throw new Error(`PBIP TMDL validation failed before export:\n${details}`);
  }
}

export async function generatePbipZip(
  analysis: EnterpriseAnalysis,
  projectName = "QLIK2PBI_Migration",
  enhancements: PbipEnhancements = {},
): Promise<Blob> {
  const safeName = safeProjectName(projectName);
  // PBIP export always recompiles from parsed operations and the latest datatype
  // contracts. It never trusts cached/UI-only M snapshots.
  const compiledAnalysis = compileAuthoritatively(analysis);
  assertCompilerInvariants(compiledAnalysis);
  const fingerprint = compilerFingerprint(compiledAnalysis);
  const deepPowerQueryValidation = await deepValidatePowerQueries(
    compiledAnalysis.mQueries,
    compiledAnalysis.stagingQueries || {},
    compiledAnalysis.columnTypes,
    compiledAnalysis.tablePreviews || {},
  );
  if (!deepPowerQueryValidation.passed) {
    const details = Object.values(deepPowerQueryValidation.queries)
      .flatMap((query) => query.issues)
      .filter((issue) => issue.severity === "blocking-error")
      .slice(0, 20)
      .map((issue) => `${issue.queryName}${issue.line ? ` line ${issue.line}${issue.column ? `:${issue.column}` : ""}` : ""}: ${issue.message}`)
      .join("\n");
    throw new Error(`PBIP export blocked by deep Power Query validation (${deepPowerQueryValidation.blockingCount} issue(s)):\n${details}`);
  }
  const modelSpec = buildTomDatabaseSpec(compiledAnalysis, safeName, enhancements);
  const tmdl = await serializeTomModel(modelSpec, {
    preferMicrosoftTom: enhancements.preferMicrosoftTom !== false,
    requireMicrosoftTom: enhancements.requireMicrosoftTom === true,
  });
  assertTmdlReady(tmdl);

  const zip = new JSZip();
  const root = zip.folder(safeName);
  if (!root) throw new Error("Failed to create root folder in ZIP");

  root.file(`${safeName}.pbip`, JSON.stringify({
    version: "1.0",
    artifacts: [{ report: { path: `${safeName}.Report` } }],
    settings: { enableAutoRecovery: true },
  }, null, 2));
  root.file(".gitignore", "**/.pbi/localSettings.json\n**/.pbi/cache.abf\n");
  root.file("OPEN_AFTER_EXTRACTION.txt", `IMPORTANT\n\n1. Extract the complete ZIP to a normal Windows folder.\n2. Do not double-click the PBIP from inside the ZIP preview.\n3. Open ${safeName}.pbip only after ${safeName}.Report and ${safeName}.SemanticModel are visible beside it.\n`);

  const semanticFolder = root.folder(`${safeName}.SemanticModel`);
  if (!semanticFolder) throw new Error("Failed to create semantic model folder.");
  semanticFolder.file(".platform", JSON.stringify({
    $schema: "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
    metadata: { type: "SemanticModel", displayName: safeName },
    config: { version: "2.0", logicalId: uuidv4() },
  }, null, 2));
  semanticFolder.file("definition.pbism", JSON.stringify(semanticModelDefinitionProperties(), null, 2));
  writeTmdlFolder(semanticFolder, tmdl);

  // Intentionally do not emit model.bim or cache.abf. The definition folder is
  // the authoritative TMDL semantic model and prevents stale TMSL metadata from
  // overriding the reviewed model on open.

  const reportFolder = root.folder(`${safeName}.Report`);
  if (!reportFolder) throw new Error("Failed to create report folder.");
  reportFolder.file(".platform", JSON.stringify({
    $schema: "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
    metadata: { type: "Report", displayName: safeName },
    config: { version: "2.0", logicalId: uuidv4() },
  }, null, 2));
  writePbirReport(reportFolder, `${safeName}.SemanticModel`, enhancements.qvwAnalysis, enhancements.powerBiModel);

  const migration = root.folder("Migration");
  if (!migration) throw new Error("Failed to create migration metadata folder.");
  const manifest = {
    generatedAt: new Date().toISOString(),
    projectName: safeName,
    sourcePackage: enhancements.qvwAnalysis?.document.fileName,
    parserVersion: enhancements.expressionInventory?.parserVersion || "3.0.0",
    semanticModelFormat: "TMDL",
    reportFormat: "PBIR",
    semanticModelEngine: tmdl.engine,
    microsoftTomRequired: enhancements.requireMicrosoftTom === true,
    compatibilityLevel: modelSpec.compatibilityLevel,
    expressionSummary: enhancements.expressionInventory?.metrics,
    modelReadiness: enhancements.powerBiModel?.readiness,
    modelBuildMode: enhancements.powerBiModel?.buildMode || compiledAnalysis.reconstruction?.modelBuildMode || "automatic",
    compilerFingerprint: fingerprint,
    reconstruction: compiledAnalysis.reconstruction ? {
      version: compiledAnalysis.reconstruction.version,
      stable: compiledAnalysis.reconstruction.stable,
      confidence: compiledAnalysis.reconstruction.confidence,
      finalModelTableCount: Object.values(compiledAnalysis.reconstruction.tables).filter((table) => table.includeInModel).length,
      aggregateMeasureCount: compiledAnalysis.reconstruction.aggregateMeasures.length,
      variableMeasureCount: compiledAnalysis.reconstruction.variableMeasures.length,
      compositeKeyCount: compiledAnalysis.reconstruction.compositeKeys.length,
      staticTableCount: compiledAnalysis.reconstruction.staticTables.length,
      retainedDroppedTableCount: compiledAnalysis.reconstruction.retainedDroppedTables.length,
      omittedStoreQvdCount: compiledAnalysis.reconstruction.omittedStoreOperationIds.length,
    } : undefined,
    tmdlDiagnostics: {
      total: tmdl.diagnostics.length,
      blocking: tmdl.diagnostics.filter((item) => item.severity === "blocking-error").length,
      warnings: tmdl.diagnostics.filter((item) => item.severity === "warning").length,
    },
    tables: modelSpec.model.tables.map((table) => ({
      id: table.id,
      name: table.name,
      columnCount: table.columns.length,
      calculatedColumnCount: table.columns.filter((column) => column.kind === "calculated").length,
      measureCount: table.measures.length,
      partitionCount: table.partitions.length,
    })),
    relationships: modelSpec.model.relationships,
    visualBindings: enhancements.powerBiModel?.visualBindings || [],
    notes: [
      "The semantic model is stored in the SemanticModel/definition TMDL folder; model.bim is intentionally not emitted.",
      "The report is stored in enhanced PBIR format with required definition.pbir and definition/ artifacts.",
      "Extract the complete ZIP before opening the PBIP file; opening from inside the ZIP can hide required sibling artifacts.",
      "Source columns, calculated columns, measures, calculated tables and relationships are represented as distinct TOM object types.",
      "A Microsoft TOM bridge is used when available; the deterministic TMDL serializer is used as a validated fallback.",
      "Unsupported Qlik expressions remain in the expression inventory with remediation guidance and are not silently discarded.",
      "Qlik DROP TABLE, SECTION ACCESS, aggregate-only and temporary payload objects are retained in migration lineage/audit metadata; only source and required mapping staging queries are emitted.",
      "Duplicate INLINE and MAPPING INLINE definitions are consolidated into canonical static M queries; unused static tables are omitted from the final model.",
      "STORE ... INTO QVD statements are omitted while their upstream and downstream lineage is preserved.",
      "Qlik ETL aggregations are represented as reusable DAX measures while row-grain tables remain in Power Query.",
    ],
  };
  migration.file("migration-manifest.json", JSON.stringify(manifest, null, 2));
  migration.file("compiler-fingerprint.json", JSON.stringify(fingerprint, null, 2));
  migration.file("validated-m-queries.json", JSON.stringify(compiledAnalysis.mQueries, null, 2));
  migration.file("tom-model-spec.json", JSON.stringify(modelSpec, null, 2));
  migration.file("tmdl-diagnostics.json", JSON.stringify(tmdl.diagnostics, null, 2));
  migration.file("tmdl-engine.txt", `${tmdl.engine}\n`);
  migration.file("expression-inventory.json", JSON.stringify(enhancements.expressionInventory || { artifacts: [] }, null, 2));
  migration.file("powerbi-model.json", JSON.stringify(enhancements.powerBiModel || analysis.semanticModel, null, 2));
  migration.file("visual-bindings.json", JSON.stringify(enhancements.powerBiModel?.visualBindings || [], null, 2));
  if (enhancements.powerBiModel) migration.file("professional-report-plan.json", JSON.stringify(buildProfessionalReportPlan(enhancements.powerBiModel, enhancements.qvwAnalysis), null, 2));
  migration.file("qlik-logic-decisions.json", JSON.stringify(analysis.logicDecisions || [], null, 2));
  migration.file("reconstruction-plan.json", JSON.stringify(compiledAnalysis.reconstruction || null, null, 2));
  migration.file("table-dependency-graph.json", JSON.stringify(
    Object.values(compiledAnalysis.reconstruction?.tables || {}).map((table) => ({
      table: table.table,
      dependencies: table.dependencies,
      inlineDependencies: table.inlineDependencies,
      droppedDependencies: table.droppedDependencies,
      operationIds: table.operationIds,
      includeInModel: table.includeInModel,
      loadEnabled: table.loadEnabled,
    })),
    null,
    2,
  ));
  migration.file("field-lineage.json", JSON.stringify(compiledAnalysis.reconstruction?.fieldLineage || [], null, 2));
  migration.file("join-reconstruction.json", JSON.stringify(compiledAnalysis.reconstruction?.joinReconstructions || [], null, 2));
  migration.file("composite-key-decisions.json", JSON.stringify(compiledAnalysis.reconstruction?.compositeKeys || [], null, 2));
  migration.file("table-classification.json", JSON.stringify(compiledAnalysis.reconstruction?.tableClassifications || [], null, 2));
  migration.file("dax-conversion-decisions.json", JSON.stringify({
    aggregateMeasures: compiledAnalysis.reconstruction?.aggregateMeasures || [],
    variableMeasures: compiledAnalysis.reconstruction?.variableMeasures || [],
  }, null, 2));
  migration.file("migration-decisions.json", JSON.stringify(compiledAnalysis.reconstruction?.migrationDecisions || [], null, 2));
  migration.file("validation-results.json", JSON.stringify(analysis.validation, null, 2));
  migration.file("power-query-ai-review.json", JSON.stringify(analysis.powerQueryReviews || {}, null, 2));
  migration.file("deep-power-query-validation.json", JSON.stringify(deepPowerQueryValidation, null, 2));
  migration.file("table-data-previews.json", JSON.stringify(analysis.tablePreviews || {}, null, 2));
  migration.file("table-execution-plans.json", JSON.stringify(analysis.executionPlans || {}, null, 2));
  migration.file("migration-debug.log", [
    ...(analysis.logs || []),
    ...(compiledAnalysis.reconstruction?.passes || []).map((pass) => `${pass.id}\t${pass.status}\t${pass.name}\t${pass.detail}`),
  ].join("\n"));
  migration.file("staging-queries.json", JSON.stringify(analysis.stagingQueries || {}, null, 2));
  const consolidatedScripts = migration.folder("consolidated-load-scripts");
  if (consolidatedScripts && compiledAnalysis.reconstruction) {
    for (const table of Object.values(compiledAnalysis.reconstruction.tables)) {
      const fileName = `${safeMigrationFileName(table.table, "Table")}.qvs`;
      consolidatedScripts.file(fileName, [
        `// Final table: ${table.table}`,
        `// Power BI decision: ${table.decision}`,
        `// Include in model: ${table.includeInModel}`,
        `// Dependencies: ${table.dependencies.join(", ") || "none"}`,
        `// Aggregations moved to DAX: ${table.aggregationMeasures.join(", ") || "none"}`,
        `// Composite keys: ${table.compositeKeys.join(", ") || "none"}`,
        "",
        table.fullLoadScript || "// No source script was recovered for this table.",
        "",
      ].join("\n"));
    }
  }
  migration.file("pipeline-logs.txt", [
    ...(enhancements.pipelineLogs || analysis.logs || []),
    `Semantic model format: TMDL`,
    `Semantic model engine: ${tmdl.engine}`,
    `TMDL files: ${Object.keys(tmdl.files).length}`,
    `TMDL diagnostics: ${tmdl.diagnostics.length}`,
  ].join("\n"));
  if (enhancements.qvwAnalysis) migration.file("qvw-analysis.json", JSON.stringify(enhancements.qvwAnalysis, null, 2));
  migration.file("README.md", `# ${safeName} Migration Package\n\nOpen \`${safeName}.pbip\` in a current Power BI Desktop version.\n\nThe reviewed semantic model is stored as TMDL under \`${safeName}.SemanticModel/definition/\`. The package intentionally contains no \`model.bim\` and no \`cache.abf\`.\n\nTraceability, TOM model specification, TMDL diagnostics and visual-binding details are under \`Migration/\`.\n`);

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
