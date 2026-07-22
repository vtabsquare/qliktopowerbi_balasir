# Authoritative Calendar Invariant Fix

## Root cause

The export invariant used the last textual occurrence of `CalendarDate` and the last textual occurrence of `FinancialYear` to infer column lifetime. This produced a false failure when a valid query renamed `CalendarDate` only after all calculations, because later final projections and datatype metadata still mentioned `FinancialYear`.

## Correction

- Detect actual `Table.RenameColumns` and `Table.RemoveColumns` operations that remove `CalendarDate`.
- Detect only executable references to `CalendarDate`, including `Record.Field`, row-field access, and `Table.Column`.
- Ignore output labels, final projections, comments, type signatures, and metadata.
- Block export only when an executable `CalendarDate` reference occurs after the real removal operation.
- Run the same invariant collection in the Export Readiness Checklist, preventing a green readiness banner followed by an export-time failure.

## Validation

- Valid late rename is accepted.
- Real use-after-rename remains blocked.
- Full regression suite and production client/SSR build pass.
