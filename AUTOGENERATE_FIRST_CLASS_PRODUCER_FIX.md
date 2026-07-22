# AUTOGENERATE First-Class Producer Fix

This release preserves existing functionality while correcting the authoritative calendar execution graph.

## Changes

- Parses `LOAD ... AUTOGENERATE ... WHILE ...` as one executable operation.
- Records producer metadata before temporary-table model exclusion.
- Resolves literal `MakeDate` bounds and dynamic `Peek(Min/Max)` bounds.
- Compiles dynamic ranges from the authoritative resident fact query.
- Preserves the explicit `AS` alias as the generated Power Query column name.
- Prevents `ManualSource` when a resolvable AUTOGENERATE producer exists.
- Keeps the same generated query through initial generation and datatype regeneration.

## Dynamic Peek chain supported

`Fact table -> resident Min/Max table -> Peek variables -> AUTOGENERATE -> resident MasterCalendar`

## Export invariant

A resolvable AUTOGENERATE lineage must not contain `QLIK2PBI.ManualSource` in the validated or exported partition expression.
