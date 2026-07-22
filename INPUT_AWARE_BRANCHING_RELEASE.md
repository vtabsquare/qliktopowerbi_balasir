# Input-Aware Branching Release

This release adds a backward-compatible upload classification layer before the existing deterministic Qlik parsing pipeline.

## Added
- Extensible artifact classification model for QVS, QVW/PRJ, QVF, QVD/QVX, source data, SQL, security, operational, visual and Power BI target assets.
- Dynamic package classification and recommended migration route.
- Separate readiness scores for ETL, model, DAX, visuals, security and reconciliation.
- Missing-input, warning and export-gate reporting.
- New **Input Analysis and Migration Route** UI panel.
- Regression tests for core branch decisions.

## Compatibility
The existing QVS auto-assignment, deterministic enterprise analysis, QVW extraction, datatype governance, DAX conversion and PBIP export flows remain unchanged. Classification is advisory and precedes them; it does not replace existing processing.
