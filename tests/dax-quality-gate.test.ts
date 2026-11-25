import { describe, expect, it } from "vitest";
import { validateDaxMeasures } from "../src/lib/migration/dax/DaxValidation";
import { repairDaxDependencies } from "../src/lib/migration/dax/DaxDependencyRepair";
import { isQlikEnvironmentVariable } from "../src/lib/migration/expression";
import { validateStepCompletion } from "../src/lib/migration/workflow-gating";
import type { PowerBiTable } from "../src/lib/migration/model";

function table(name: string, columns: string[], measures: PowerBiTable["measures"] = []): PowerBiTable {
  return {
    id: `T-${name}`,
    name,
    sourceName: name,
    kind: "fact",
    hidden: false,
    columns: columns.map((column) => ({ id: `C-${name}-${column}`, name: column, sourceName: column, dataType: "decimal", hidden: false, isKey: false })),
    measures,
    hierarchies: [],
    sourceLineage: [],
    warnings: [],
  };
}

function measure(id: string, name: string, expression: string, homeTable = "Sales") {
  return { id, name, expression, originalExpression: `Qlik ${name}`, homeTable, displayFolder: "Qlik measures", hidden: false, approved: false, status: "generated" };
}

describe("Phase 2 DAX quality gate", () => {
  it("blocks syntax, unknown function and unresolved model references", () => {
    const tables = [table("Sales", ["Amount"] )];
    const results = validateDaxMeasures([
      { id: "bad-syntax", name: "Bad syntax", expression: "SUM('Sales'[Amount]", table: "Sales" },
      { id: "bad-function", name: "Bad function", expression: "QLIKSUM('Sales'[Amount])", table: "Sales" },
      { id: "bad-reference", name: "Bad reference", expression: "SUM('Sales'[Missing])", table: "Sales" },
    ], tables);

    expect(results.every((result) => result.status !== "valid")).toBe(true);
    expect(results.flatMap((result) => result.issues.map((issue) => issue.code))).toEqual(expect.arrayContaining([
      "DAX_DELIMITER_UNCLOSED",
      "DAX_FUNCTION_UNKNOWN",
      "DAX_DEPENDENCY_MISSING",
    ]));
    expect(results[0].issues[0]).toEqual(expect.objectContaining({ line: 1, column: expect.any(Number) }));
  });

  it("keeps warnings visible without blocking a valid expression", () => {
    const tables = [table("Sales", ["Amount"] )];
    const results = validateDaxMeasures([
      { id: "one", name: "Revenue", expression: "SUM('Sales'[Amount])", table: "Sales" },
      { id: "two", name: "Revenue copy", expression: "SUM('Sales'[Amount])", table: "Sales" },
    ], tables);

    expect(results[1].status).toBe("valid");
    expect(results[1].issues).toContainEqual(expect.objectContaining({ code: "DAX_DUPLICATE_EXPRESSION", severity: "warning" }));
  });

  it("repairs only a high-confidence schema match and passes the same validator afterward", () => {
    const broken = measure("M-Revenue", "Revenue", "SUM('Sales'[ActualAmount])");
    const tables = [table("Sales", ["Amount"], [broken])];
    const before = validateDaxMeasures([{ id: broken.id, name: broken.name, expression: broken.expression, table: "Sales" }], tables);
    expect(before[0].status).toBe("needs-fix");

    const repaired = repairDaxDependencies(tables).tables;
    const repairedMeasure = repaired[0].measures[0];
    const after = validateDaxMeasures([{ id: repairedMeasure.id, name: repairedMeasure.name, expression: repairedMeasure.expression, table: "Sales" }], repaired);

    expect(repairedMeasure.expression).toBe("SUM('Sales'[Amount])");
    expect(after[0].status).toBe("valid");
  });

  it("repairs supported Qlik date functions and a safely missing closing parenthesis", () => {
    const broken = measure("M-Period", "Period start", "MonthStart(MAX('Sales'[OrderDate])");
    const repaired = repairDaxDependencies([table("Sales", ["OrderDate"], [broken])]).tables[0].measures[0];

    expect(repaired.expression).toBe("DATE(YEAR(MAX('Sales'[OrderDate])), MONTH(MAX('Sales'[OrderDate])), 1)");
    const result = validateDaxMeasures([{ id: repaired.id, name: repaired.name, expression: repaired.expression, table: "Sales" }], [table("Sales", ["OrderDate"], [repaired])]);
    expect(result[0].status).toBe("valid");
    expect(repaired.approved).toBe(true);
  });

  it("keeps Qlik locale and formatting settings out of the measure inventory", () => {
    expect(isQlikEnvironmentVariable("MoneyFormat")).toBe(true);
    expect(isQlikEnvironmentVariable("DecimalSep")).toBe(true);
    expect(isQlikEnvironmentVariable("vRevenueTarget")).toBe(false);
  });

  it("requires a current passing result before workflow completion", () => {
    expect(validateStepCompletion(6, {})).toEqual(expect.objectContaining({ ok: false }));
    expect(validateStepCompletion(6, { hasCurrentDaxValidation: true, hasBlockingDaxErrors: true })).toEqual(expect.objectContaining({ ok: false }));
    expect(validateStepCompletion(6, { hasCurrentDaxValidation: true, hasBlockingDaxErrors: false })).toEqual({ ok: true });
  });

  it("strips Peek() placeholder markers and produces a valid VALUE(FORMAT(MAX/MIN(...), \"YYYYMMDD\")) measure", () => {
    const peekPlaceholder = `VALUE(// Manual conversion required for Peek()\n"MaxDate")`;
    const literalValueBroken = `VALUE("MinDate")`;
    const vMaxMeasure = {
      ...measure("M-vMaxDate", "vMaxDate", peekPlaceholder, "MasterCalendar"),
      originalExpression: "Num(Peek('MaxDate', 0, 'CalendarBounds'))",
      approved: false,
      status: "needs-fix",
    };
    const vMinMeasure = {
      ...measure("M-vMinDate", "vMinDate", literalValueBroken, "MasterCalendar"),
      originalExpression: "Num(Peek('MinDate', 0, 'CalendarBounds'))",
      approved: false,
      status: "needs-fix",
    };
    const calTable = table("MasterCalendar", ["CalendarDate", "Year", "Month"], [vMaxMeasure, vMinMeasure]);
    calTable.kind = "calendar";
    calTable.columns[0].dataType = "dateTime";
    const tables = [calTable];

    const before = validateDaxMeasures(
      [
        { id: vMaxMeasure.id, name: vMaxMeasure.name, expression: peekPlaceholder, table: "MasterCalendar" },
        { id: vMinMeasure.id, name: vMinMeasure.name, expression: literalValueBroken, table: "MasterCalendar" },
      ],
      tables,
    );
    expect(before[0].status).not.toBe("valid");
    expect(before[1].status).not.toBe("valid");

    const repairedTables = repairDaxDependencies(tables).tables;
    const repairedMax = repairedTables[0].measures[0];
    const repairedMin = repairedTables[0].measures[1];
    expect(repairedMax.expression).toBe(`VALUE(FORMAT(MAX(MasterCalendar[CalendarDate]), "YYYYMMDD"))`);
    expect(repairedMin.expression).toBe(`VALUE(FORMAT(MIN(MasterCalendar[CalendarDate]), "YYYYMMDD"))`);

    const after = validateDaxMeasures(
      [
        { id: repairedMax.id, name: repairedMax.name, expression: repairedMax.expression, table: "MasterCalendar" },
        { id: repairedMin.id, name: repairedMin.name, expression: repairedMin.expression, table: "MasterCalendar" },
      ],
      repairedTables,
    );
    expect(after[0].status).toBe("valid");
    expect(after[1].status).toBe("valid");
  });

  it("never overwrites a valid user-approved measure during dependency repair", () => {
    const approvedMeasure = {
      ...measure("M-Approved", "Approved Revenue", "SUM('Sales'[Amount])"),
      approved: true,
      status: "approved",
    };
    const tables = [table("Sales", ["Amount"], [approvedMeasure])];
    const repaired = repairDaxDependencies(tables);
    expect(repaired.tables[0].measures[0].expression).toBe("SUM('Sales'[Amount])");
    expect(repaired.tables[0].measures[0].approved).toBe(true);
    expect(repaired.repairs).toHaveLength(0);
  });
});

