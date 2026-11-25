import type { ModelDiagnostic, PowerBiModelState, PowerBiRelationship, PowerBiTable } from "./PowerBiModelTypes";
import { modelDaxInputs, validateDaxMeasures } from "../dax/DaxValidation";

function compatibleType(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const lower = value.toLowerCase();
    if (/int|decimal|double|number|currency|float/.test(lower)) return "number";
    if (/date|time/.test(lower)) return "date";
    if (/bool/.test(lower)) return "boolean";
    return "string";
  };
  return normalize(left) === normalize(right);
}

function duplicateKey(rel: PowerBiRelationship): string {
  return [rel.fromTableId, rel.fromColumnId, rel.toTableId, rel.toColumnId].join("|").toLowerCase();
}

function relationshipSides(relationship: PowerBiRelationship) {
  if (relationship.cardinality === "one-to-many") return { oneTableId: relationship.fromTableId, oneColumnId: relationship.fromColumnId };
  if (relationship.cardinality === "many-to-one") return { oneTableId: relationship.toTableId, oneColumnId: relationship.toColumnId };
  return null;
}

export function validateRelationship(relationship: PowerBiRelationship, tables: PowerBiTable[], all: PowerBiRelationship[] = []): ModelDiagnostic[] {
  const diagnostics: ModelDiagnostic[] = [];
  const fromTable = tables.find((table) => table.id === relationship.fromTableId);
  const toTable = tables.find((table) => table.id === relationship.toTableId);
  const fromColumn = fromTable?.columns.find((column) => column.id === relationship.fromColumnId);
  const toColumn = toTable?.columns.find((column) => column.id === relationship.toColumnId);
  const add = (severity: ModelDiagnostic["severity"], code: string, message: string, recommendation: string) => diagnostics.push({ id: `${relationship.id}-${code}`, severity, area: "relationship", objectId: relationship.id, objectName: relationship.id, code, message, recommendation });

  if (!fromTable || !toTable) add("blocking-error", "RELATIONSHIP_TABLE_MISSING", "A relationship references a table that is not present in the semantic model.", "Select valid source and target tables or delete the relationship.");
  if (!fromColumn || !toColumn) add("blocking-error", "RELATIONSHIP_COLUMN_MISSING", "A relationship references a column that is not present in the semantic model.", "Select valid columns before exporting the PBIP package.");
  if (fromTable?.id === toTable?.id) add("error", "SELF_RELATIONSHIP", "The relationship connects a table to itself.", "Use a role-playing copy or remove the self relationship.");
  if (fromColumn && toColumn && !compatibleType(fromColumn.dataType, toColumn.dataType)) add("blocking-error", "RELATIONSHIP_TYPE_MISMATCH", `${fromColumn.dataType} is not compatible with ${toColumn.dataType}.`, "Align the data types in the Data Types page or select compatible key columns.");
  const sides = relationshipSides(relationship);
  if (sides) {
    const oneTable = tables.find((table) => table.id === sides.oneTableId);
    const oneColumn = oneTable?.columns.find((column) => column.id === sides.oneColumnId);
    if (oneColumn && (oneColumn.nullPercentage ?? 0) > 0) add("blocking-error", "ONE_SIDE_KEY_HAS_BLANKS", `${oneTable?.name}[${oneColumn.name}] contains blank sample values.`, "Filter null keys in Power Query or choose a nonblank unique key before exporting the relationship.");
    if (oneTable?.sampleRowCount && typeof oneColumn?.distinctCount === "number" && oneColumn.distinctCount < oneTable.sampleRowCount) add("blocking-error", "ONE_SIDE_KEY_NOT_UNIQUE", `${oneTable.name}[${oneColumn.name}] is not unique in the uploaded sample.`, "Deduplicate the lookup table, build a bridge, or choose a truly unique one-side key.");
  }
  const duplicates = all.filter((item) => !item.deleted && item.id !== relationship.id && duplicateKey(item) === duplicateKey(relationship));
  if (duplicates.length) add("blocking-error", "DUPLICATE_RELATIONSHIP", "The same relationship already exists.", "Keep only one relationship between the selected columns.");
  if (relationship.cardinality === "many-to-many") add("warning", "MANY_TO_MANY_RISK", "Many-to-many relationships can create ambiguous totals.", "Prefer a bridge table with one-to-many relationships where possible.");
  if (relationship.crossFilterDirection === "both") add("warning", "BIDIRECTIONAL_FILTER_RISK", "Bidirectional filtering can create ambiguous filter paths.", "Use single-direction filtering unless a documented use case requires both directions.");
  if (relationship.active && all.some((item) => item.id !== relationship.id && item.active && !item.deleted && item.fromTableId === relationship.fromTableId && item.toTableId === relationship.toTableId)) add("warning", "MULTIPLE_ACTIVE_PATHS", "More than one active relationship exists between the same pair of tables.", "Keep one active relationship and make alternate paths inactive for USERELATIONSHIP().");
  return diagnostics;
}

export function validatePowerBiModel(model: PowerBiModelState): PowerBiModelState {
  const diagnostics: ModelDiagnostic[] = [];
  const daxValidation = new Map(
    validateDaxMeasures(modelDaxInputs(model.tables), model.tables).map((result) => [result.measureId, result]),
  );
  const tableNames = new Map<string, string[]>();
  const measureNames = new Map<string, string[]>();
  const measureExpressions = new Map<string, { id: string; name: string; table: string }>();
  for (const table of model.tables) {
    const key = table.name.toLowerCase();
    tableNames.set(key, [...(tableNames.get(key) ?? []), table.id]);
    if (!table.columns.length && !table.calculatedExpression) diagnostics.push({ id: `${table.id}-NO_COLUMNS`, severity: "blocking-error", area: "table", objectId: table.id, objectName: table.name, code: "TABLE_WITHOUT_COLUMNS", message: "The table has no columns and no calculated-table expression.", recommendation: "Restore its query columns or exclude the table from export." });
    const keyColumns = table.columns.filter((column) => column.isKey);
    if (keyColumns.length > 1) diagnostics.push({ id: `${table.id}-MULTIPLE_KEYS`, severity: "blocking-error", area: "table", objectId: table.id, objectName: table.name, code: "MULTIPLE_TABLE_KEYS", message: `The table '${table.name}' has ${keyColumns.length} columns marked as row keys.`, recommendation: "Choose one Row Identifier in the simplified Tables & Keys screen, or select None for a fact table without a verified unique row ID." });
    if (["dimension", "date", "parameter"].includes(table.kind) && keyColumns.length === 0) diagnostics.push({ id: `${table.id}-NO_KEY`, severity: "warning", area: "table", objectId: table.id, objectName: table.name, code: "KEY_NOT_DESIGNATED", message: "No row identifier is designated for this lookup-side table.", recommendation: "Use the recommended Row Identifier when the table is on the one side of a relationship." });
    const columnNameKeys = new Set(table.columns.map((column) => column.name.trim().toLowerCase()));
    for (const measure of table.measures) {
      const nameKey = measure.name.trim().toLowerCase();
      measureNames.set(nameKey, [...(measureNames.get(nameKey) ?? []), measure.id]);
      for (const issue of daxValidation.get(measure.id)?.issues ?? []) {
        diagnostics.push({
          id: `${measure.id}-${issue.code}-${issue.offset ?? "expression"}`,
          severity: issue.severity === "error" ? "blocking-error" : "warning",
          area: "measure",
          objectId: measure.id,
          objectName: measure.name,
          code: issue.code,
          message: `${issue.message}${issue.line ? ` (line ${issue.line}, column ${issue.column})` : ""}`,
          recommendation: issue.reason,
        });
      }
      if (columnNameKeys.has(nameKey)) diagnostics.push({ id: `${measure.id}-COLUMN_COLLISION`, severity: "blocking-error", area: "measure", objectId: measure.id, objectName: measure.name, code: "MEASURE_COLUMN_NAME_COLLISION", message: `The measure '${measure.name}' has the same name as a column in '${table.name}'.`, recommendation: "Use the automatically generated collision-safe measure name before exporting." });
      if (!measure.displayFolder?.trim()) diagnostics.push({ id: `${measure.id}-NO_FOLDER`, severity: "blocking-error", area: "measure", objectId: measure.id, objectName: measure.name, code: "MEASURE_DISPLAY_FOLDER_MISSING", message: `The measure '${measure.name}' is not assigned to a display folder.`, recommendation: "Assign every measure to a Power BI display folder." });
      if (/^(?:'((?:[^']|'')+)'|[A-Za-z_][A-Za-z0-9_ ]*)\s*\[[^\]]+\]$/.test(measure.expression.trim())) {
        diagnostics.push({ id: `${measure.id}-NAKED-COLUMN`, severity: "blocking-error", area: "measure", objectId: measure.id, objectName: measure.name, code: "MEASURE_NAKED_COLUMN_REFERENCE", message: `The measure '${measure.name}' directly returns a column without scalar aggregation.`, recommendation: "Use SELECTEDVALUE, MIN, MAX, SUM, COUNT or another context-appropriate scalar expression." });
      }
      const expressionKey = measure.expression.replace(/\s+/g, "").toLowerCase();
      const duplicateExpression = measureExpressions.get(expressionKey);
      if (expressionKey && duplicateExpression) diagnostics.push({ id: `${measure.id}-DUPLICATE_DAX`, severity: "warning", area: "measure", objectId: measure.id, objectName: measure.name, code: "DUPLICATE_MEASURE_EXPRESSION", message: `The measure '${measure.name}' shares its DAX expression with '${duplicateExpression.name}' from '${duplicateExpression.table}'.`, recommendation: "This is valid. Consolidate only when the measures are semantically identical and no independent lineage is required." });
      else if (expressionKey) measureExpressions.set(expressionKey, { id: measure.id, name: measure.name, table: table.name });
    }
  }
  for (const [name, ids] of tableNames) if (ids.length > 1) diagnostics.push({ id: `DUP-TABLE-${name}`, severity: "blocking-error", area: "model", objectName: name, code: "DUPLICATE_TABLE_NAME", message: `Multiple tables use the name '${name}'.`, recommendation: "Rename tables so semantic-model object names are unique." });
  for (const [name, ids] of measureNames) if (ids.length > 1) diagnostics.push({ id: `DUP-MEASURE-${name}`, severity: "blocking-error", area: "model", objectName: name, code: "DUPLICATE_MEASURE_NAME", message: `Multiple measures use the name '${name}'.`, recommendation: "Rename measures and update dependent DAX references." });
  for (const relationship of model.relationships.filter((item) => !item.deleted)) diagnostics.push(...validateRelationship(relationship, model.tables, model.relationships));
  for (const binding of model.visualBindings) {
    const missingMeasures = binding.measureIds.filter((id) => !model.tables.some((table) => table.measures.some((measure) => measure.id === id)));
    const missingColumns = binding.dimensionIds.filter((id) => !model.tables.some((table) => table.columns.some((column) => column.id === id)));
    if (missingMeasures.length || missingColumns.length) diagnostics.push({ id: `${binding.id}-MISSING_BINDING`, severity: "error", area: "visual", objectId: binding.id, objectName: binding.objectTitle || binding.objectId, code: "VISUAL_BINDING_MISSING", message: "The visual references measures or columns that are not present in the proposed model.", recommendation: "Map the missing visual fields before export." });
  }
  const blockingErrorCount = diagnostics.filter((item) => item.severity === "blocking-error" && !item.approved).length;
  const warningCount = diagnostics.filter((item) => item.severity === "warning").length;
  return { ...model, diagnostics, blockingErrorCount, warningCount, readiness: blockingErrorCount ? "not-ready" : warningCount || diagnostics.some((item) => item.severity === "error") ? "ready-with-warnings" : "ready" };
}
