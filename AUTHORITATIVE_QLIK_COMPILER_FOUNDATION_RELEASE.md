# Authoritative Qlik Compiler Foundation

This release removes the divergent M-generation path used by the Regenerate action and makes PBIP export recompile from parsed Qlik operations and the latest datatype registry.

## Implemented foundation

- One authoritative `QlikCompilerService` entry point for deterministic recompilation.
- PBIP export recompiles and validates instead of trusting persisted UI M text.
- Compiler fingerprints cover source artifacts, parser/project revision, execution plans, datatype contracts and generated M.
- Export writes `Migration/compiler-fingerprint.json` and `Migration/validated-m-queries.json`.
- Qlik LOAD sibling expressions execute before source-field renames, preserving `CalendarDate` through all dependent calculations.
- Every Qlik JOIN receives a dedicated operation-scoped join payload query.
- Join payload fields are source requirements only; target validation contains join keys only.
- Raw AI M replacement was removed from the Regenerate action. AI remains a governed diagnosis/proposal layer.
- Compiler invariants block ManualSource leakage, stale datatype endings, function-as-column errors and invalid join payload contracts.

## Required workflow after installation

Create a new analysis or clear the old saved workspace. Regenerate, run current-script validation, then export a new PBIP. The exported migration folder contains hashes that can be compared with the UI/compiler state.
