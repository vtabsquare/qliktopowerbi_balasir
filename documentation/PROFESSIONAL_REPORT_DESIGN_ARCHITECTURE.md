# Professional Report Design Architecture

Qlik UI metadata and the validated Power BI semantic model are converted into a canonical ReportPlan. The plan separates Qlik fidelity objects from Power BI enhancements and is then passed through deterministic PBIR generation.

Pipeline:

Qlik UI / semantic model -> profiler -> KPI and dimension discovery -> ReportPlan -> PBIR writer -> queryRef validation -> PBIP export.

When Qlik UI metadata is missing, the engine creates a 360-degree baseline rather than exporting a blank report. It does not invent measures; only existing semantic-model measures and columns are bound.
