# User-Controlled Calendar Builder Release

## Purpose

The Power Query page now allows the user to choose one of four calendar strategies without changing the existing Qlik ETL compiler:

1. Use the uploaded Qlik calendar logic.
2. Generate a continuous calendar from a selected final table and date column.
3. Generate a continuous calendar from explicit start and end dates.
4. Disable calendar generation.

## Behaviour

The selected configuration is stored in `EnterpriseAnalysis.calendarOverride`. The same analysis object is used for regeneration, validation, preview and PBIP export. Datatype-triggered recompilation reapplies the calendar override automatically.

The generated calendar includes Date, Year, Quarter, Month, sort columns, week attributes, day attributes and configurable fiscal year. Final calendar datatypes are deterministic and the date key is nonblank and distinct.

## Safety

- Existing Qlik compilation is unchanged when **Use Qlik logic** is selected.
- Final-table mode validates that the selected query and date column exist.
- Fixed-range mode validates the date range.
- Calendar relationships are created only for final-table mode.
- The generated query contains no ManualSource fallback or Qlik-only syntax.
