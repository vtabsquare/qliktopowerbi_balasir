import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { collectCompilerInvariantIssues, deterministicHash } from "../src/lib/migration/QlikCompilerService";

describe("authoritative Qlik compiler foundation", () => {
  it("routes PBIP export through the authoritative compiler", () => {
    const source = fs.readFileSync(path.resolve("src/lib/migration/pbip-generator.ts"), "utf8");
    expect(source).toContain("compileAuthoritatively(analysis)");
    expect(source).toContain("assertCompilerInvariants(compiledAnalysis)");
    expect(source).toContain("validated-m-queries.json");
    expect(source).toContain("compiler-fingerprint.json");
  });

  it("preserves Qlik LOAD sibling input lifetime and creates join payload helpers", () => {
    const source = fs.readFileSync(path.resolve("src/lib/migration/enterprise-parser.ts"), "utf8");
    const calculation = source.indexOf("for (const [alias, calc] of calcs)");
    const rename = source.indexOf("if (renames.length)", calculation);
    expect(calculation).toBeGreaterThan(0);
    expect(rename).toBeGreaterThan(calculation);
    expect(source).toContain("JoinPayload_");
    expect(source).toContain("joinPayloadColumns = uniq([...rightKeys, ...requestedExpand])");
  });

  it("produces stable compiler hashes", () => {
    expect(deterministicHash({ b: 2, a: 1 })).toBe(deterministicHash({ a: 1, b: 2 }));
    expect(deterministicHash("x")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("does not confuse final calendar labels or type metadata with a late CalendarDate dependency", () => {
    const query = `let
    CalendarBase = #table({"CalendarDate"}, {{#date(2024,1,1)}}),
    AddedYear = Table.AddColumn(CalendarBase, "Year", each Date.Year(Record.Field(_, "CalendarDate")), Int64.Type),
    AddedFinancialYear = Table.AddColumn(AddedYear, "FinancialYear", each Text.From(Date.Year(Record.Field(_, "CalendarDate"))), type text),
    RenamedCalendarDate = Table.RenameColumns(AddedFinancialYear, {{"CalendarDate", "Date"}}, MissingField.Error),
    SelectedCalendarColumns = Table.SelectColumns(RenamedCalendarDate, {"Date", "Year", "FinancialYear"}, MissingField.Error),
    ReviewedTypeConversions = Table.TransformColumnTypes(SelectedCalendarColumns, {{"Date", type date}, {"Year", Int64.Type}, {"FinancialYear", type text}})
in
    ReviewedTypeConversions`;
    const issues = collectCompilerInvariantIssues({ mQueries: { MasterCalendar: query }, executionPlans: {} } as any);
    expect(issues).not.toContain("MasterCalendar: CalendarDate is removed before its final dependent calculation");
  });

  it("blocks a real CalendarDate reference after the column is renamed", () => {
    const query = `let
    CalendarBase = #table({"CalendarDate"}, {{#date(2024,1,1)}}),
    RenamedCalendarDate = Table.RenameColumns(CalendarBase, {{"CalendarDate", "Date"}}, MissingField.Error),
    AddedYear = Table.AddColumn(RenamedCalendarDate, "Year", each Date.Year(Record.Field(_, "CalendarDate")), Int64.Type),
    ReviewedTypeConversions = Table.TransformColumnTypes(AddedYear, {{"Date", type date}, {"Year", Int64.Type}})
in
    ReviewedTypeConversions`;
    const issues = collectCompilerInvariantIssues({ mQueries: { MasterCalendar: query }, executionPlans: {} } as any);
    expect(issues).toContain("MasterCalendar: CalendarDate is removed before its final dependent calculation");
  });

});
