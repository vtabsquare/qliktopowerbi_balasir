# Qlik AUTOGENERATE Lineage and Alias Permanent Fix

## Root cause

Variable-driven Qlik calendars could be detected by the Calendar Analysis UI but still fall through to `QLIK2PBI.ManualSource` in the authoritative M generator when the `MakeDate()` bounds were declared in another QVS file. In addition, the AUTOGENERATE field parser could accidentally use the complete expression text as the generated Power Query column name instead of the explicit `AS CalendarDate` alias.

The AI repair path could then propose replacing the original Qlik calendar with a calendar inferred from a fact table, overwriting valid implemented calendar semantics.

## Corrections

- AUTOGENERATE bounds are resolved from variables across the consolidated Qlik project.
- Explicit `AS` aliases are parsed independently from expression text.
- AUTOGENERATE output uses `Table.FromColumns` with an explicit schema.
- Generated output schema is validated immediately.
- `ManualSource` is prohibited for resolvable AUTOGENERATE + WHILE + IterNo patterns.
- AI source inference cannot overwrite an authoritative AUTOGENERATE calendar lineage.
- Preview, regeneration and export continue to use the same compiler output.

## Expected output

The generated temporary calendar contains a column named exactly `CalendarDate`, and the MasterCalendar resident load references that column successfully.

## Validation

- 38 test files passed.
- 113 tests passed.
- Client production build passed.
- SSR/server production build passed.
