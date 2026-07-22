# RegionMap AI Correction Fix

This release corrects the AI repair workflow for missing Qlik MAPPING LOAD dependencies.

## Fixed

- Recognizes diagnostics formatted as `unknown named query/queries: <name>`.
- Resolves the matching Qlik `MAPPING LOAD` operation from parser metadata.
- Traces QVD producer lineage to the correct staging/source query.
- Generates the missing two-column Power Query lookup query.
- Preserves ApplyMap fallback behavior in the existing final query.
- Shows the exact generated dependency under **Smallest safe patch** before approval.
- Applies the dependency through the governed proposal workflow.
- Re-runs M structure and named-query dependency validation.

## Example

For `RegionMap: MAPPING LOAD RegionID, RegionName ...`, the correction creates a query similar to:

```powerquery
let
    Source = #"Source_Regions_Stg",
    SelectedColumns = Table.SelectColumns(Source, {"RegionID", "RegionName"}, MissingField.Error),
    ValidKeys = Table.SelectRows(SelectedColumns, each Record.FieldOrDefault(_, "RegionID", null) <> null),
    Lookup = Table.Distinct(ValidKeys, {"RegionID"})
in
    Lookup
```

No project-specific RegionMap rule is hard-coded; the mapping name and columns are read from the canonical parser operations.
