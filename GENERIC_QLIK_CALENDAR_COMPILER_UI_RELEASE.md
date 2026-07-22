# Generic Qlik Calendar Compiler and Calendar Analysis UI

This release adds a dedicated Calendar Analysis page and a generic calendar metadata analyzer based on the attached requirements.

Implemented UI areas:
- candidate detection and confidence;
- calendar type and generation pattern;
- date-range source, start and end logic;
- calendar variables and static resolution;
- lineage and dependencies;
- generated M review;
- generated columns and sort-column guidance;
- relationship review;
- validation checks;
- configurable fiscal start, first day of week and culture;
- reviewable AI repair workflow.

Generic supported detection patterns include AUTOGENERATE/IterNo, resident distinct calendars, physical calendar sources, inline periods, canonical dates, role-playing dates, as-of calendars, fiscal calendars, retail signals, ISO week and business-day attributes.

The analyzer does not hard-code MasterCalendar, FactSales, OrderDate, vMinDate, vMaxDate or an April fiscal year. Names and dependencies are derived from project operations and variables.

Validation completed for this package:
- Calendar route is registered at `/app/calendar-analysis` and linked from the application header.
- Calendar analyzer regression test added for variable-driven AUTOGENERATE, WeekDay and Right handling.
- 33 test files and 103 tests pass.
- Client and SSR production builds pass.
