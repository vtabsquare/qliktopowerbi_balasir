# Native Power BI Visual Generation

The export pipeline now writes PBIR report pages and native `visual.json` files from the QVW/PRJ visual inventory and validated semantic-model bindings.

## Implemented flow

1. Parse Qlik sheets and visualization objects from QVW PRJ/Engine API metadata.
2. Build validated `VisualBinding` records against semantic-model columns and measures.
3. Map Qlik visual intent to native Power BI types.
4. Preserve sheet-to-page assignment and available x/y/width/height/z-order metadata.
5. Generate one PBIR visual folder and `visual.json` per valid/reviewable binding.
6. Bind dimensions and measures to semantic-model fields.
7. Add report titles and Qlik traceability annotations.
8. Keep unsupported/custom-extension visuals in migration metadata for manual review rather than silently inventing behavior.

## Supported native mappings

Straight table, pivot table, bar/column charts, stacked variants, line chart, combo chart, pie/donut, scatter, gauge, KPI/card and slicer. Unknown native mappings fall back to a table so fields remain reviewable.

## Required source evidence

A QVS file alone does not contain dashboard objects. Visual generation requires QVW PRJ XML/TXT metadata or an Engine API/exported visual inventory. When that evidence is absent, the package intentionally creates only a review page.

## Validation boundary

The TypeScript test/build pipeline validates deterministic generation and JSON construction. Final rendering must still be verified by opening the extracted PBIP in a current Power BI Desktop version because rendering also depends on Desktop schema version, model refresh, field availability and Qlik metadata completeness.
