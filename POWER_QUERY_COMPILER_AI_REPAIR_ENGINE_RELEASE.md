# Power Query Compiler + AI Repair Engine

## Scope

This release upgrades the existing governed AI correction workflow into an iterative, metadata-grounded Power Query compiler/repair service. It does not replace the Qlik parser, canonical analysis, datatype registry, M generator, DAX translator, validators, or PBIP exporter.

## Added engine

`src/lib/migration/power-query/PowerQueryCompilerRepairEngine.ts`

The engine now:

- Compiles generated M into deterministic diagnostics.
- Detects unresolved generated/manual sources.
- Detects rename-before-use defects.
- Detects unsupported Qlik `WeekDay()` conversion placeholders.
- Detects reviewed datatype contracts that conflict with generated values.
- Detects unresolved named-query dependencies.
- Infers a calendar source only from grounded project metadata and date-bearing fields.
- Reconstructs a safe Master Calendar in dependency order.
- Generates `WeekDay` with `Date.DayOfWeekName`.
- Preserves numeric sort columns for YearMonth, WeekDay, Quarter, and FinancialYear.
- Runs bounded repair iterations and reports remaining diagnostics.
- Refuses to invent a source when no date-bearing project object exists.

## AI correction integration

`AiCorrectionEngine` invokes the compiler/repair service before generic text-based fixes. A compiler-guided correction is returned as a governed proposal with:

- current and corrected M;
- inferred source evidence;
- risk and confidence;
- affected objects;
- required validations;
- approval and rollback support.

Approved corrections continue through the existing project correction workflow. Runtime preview, reconciliation, and PBIP refresh remain explicit validation gates.

## Generic behavior

Source selection is based on project profiles and available generated queries. No project-specific fact table or field name is hard-coded. Date-field candidates are scored from semantic metadata such as `OrderDate`, `TransactionDate`, `SalesDate`, or other fields ending in `Date`.

When evidence is insufficient, the correction remains `Manual Review Required`.

## Validation

- 30 test files passed.
- 98 tests passed.
- Client production build passed.
- Server production build passed.

The tests include successful calendar reconstruction and a guard proving that the engine does not invent a source when no date-bearing query exists.
