# Authoritative Calendar Generation Path Fix

This release fixes the production divergence where Calendar Analysis recognised an AUTOGENERATE calendar but Power Query regeneration or PBIP export still emitted `QLIK2PBI.ManualSource`.

## Root cause

The final-table and join-payload M builders were created with an empty variable map. Variables declared in separate QVS files were available to project analysis but not to every M-generation path.

## Fix

- Derive one project-wide variable context from all uploaded text artifacts.
- Pass that same context to final-table generation, datatype regeneration, staging/helper generation, preview and export.
- Preserve the explicit `AS CalendarDate` alias.
- Compile `AUTOGENERATE + WHILE + IterNo()` using `List.Dates` and `Table.FromColumns`.
- Keep AI repair from replacing a recognised Qlik calendar with an inferred alternative.

## Validation

Regression coverage verifies both initial generation and datatype-triggered regeneration do not contain `QLIK2PBI.ManualSource`.
