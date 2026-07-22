# M Query Error Highlighting and AI-Assisted Guidance

## Enhancement

The Power Query review surface now uses a diagnostic M Query Editor instead of a plain code block.

### Added

- Yellow line shading for M-query lines associated with parser, semantic, dependency, Qlik-syntax, and datatype issues.
- Token-level yellow highlighting for named-query dependencies such as `RegionMap`.
- Line numbers and a highlighted-line counter.
- AI-assisted correction guidance showing the detected issue, recommended fix, and parser evidence.
- Editable M-query mode.
- Save and revalidate workflow using the existing deterministic review engine.
- Export remains blocked while blocking diagnostics remain.

### Backward compatibility

The existing QVS reconstruction, datatype governance, DAX conversion, model generation, validation, and PBIP export logic are unchanged. The enhancement is limited to the M-query review/editor presentation and save/revalidation workflow.

## Validation

- 27 test files passed.
- 91 tests passed.
- Vite client and SSR production builds passed.
