# Mapping Load and Original Qlik Lineage Permanent Fix

## Root causes corrected

1. Adjacent Qlik statements inherited the semicolon line of the prior statement, producing overlapping ranges such as `1-6` and `6-13`.
2. Generic recommendation prose was incorrectly tokenized, causing unrelated Qlik lines to be marked as errors.
3. Any textual occurrence of a mapping name was marked red, including the mapping definition and source filename.
4. The UI did not distinguish a dependency definition from the consuming `ApplyMap()` line that caused the generated Power Query diagnostic.

## New behavior

- Physical statement ranges are derived from the first and last non-whitespace source line.
- Recommendation prose is excluded from diagnostic token extraction.
- Only authoritative identifiers from diagnostic message/evidence are matched.
- `ApplyMap('MapName', ...)`, `RESIDENT`, `JOIN`, and `CONCATENATE` consumption references are highlighted red.
- Mapping/table labels such as `RegionMap:` are highlighted amber as dependency definitions.
- Filenames such as `RegionMap.csv` are not treated as failing Qlik statements.
- Mapping loads remain helper dependencies and are not exported as semantic-model tables.

## Expected example

- `RegionMap:`: amber dependency definition.
- `ApplyMap('RegionMap', RegionID, ...)`: red consuming line.
- `FROM [...\\RegionMap.csv]`: normal source context.

## ApplyMap compiler correction

The Power Query compiler now builds the mapping source inside the affected final-table query. It no longer emits an unresolved external reference such as `#"RegionMap"` or `#"StatusMap"` for a helper mapping table that is intentionally excluded from the semantic model.

The rule is generic:

1. Resolve the `MAPPING LOAD` operation by canonical mapping name.
2. Resolve its actual source or resident lineage.
3. Compile the mapping source into an internal M step.
4. Use the first mapping field as the key and the second as the value.
5. Apply the Qlik default value when no match exists.
6. Keep the mapping helper out of the Power BI semantic model.
