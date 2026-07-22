# Qlik Load-Script Error Highlighting

The AI correction proposal now resolves Power Query and model diagnostics back to the authoritative Qlik parser operations.

## Behaviour
- Uses parser-generated file, operation, start-line and end-line metadata.
- Highlights the Qlik producer statement and the consuming statement when both are relevant.
- Shows two context lines before and after the statement.
- Marks offending mapping, field, table or query tokens.
- Remains generic: no project-specific table or field names are hard-coded.
- Preserves exact source evidence in every governed AI correction proposal.

## Example
For a missing `RegionMap` M dependency, the proposal highlights both the original `MAPPING LOAD` and the downstream `ApplyMap` statement in the uploaded QVS file.
