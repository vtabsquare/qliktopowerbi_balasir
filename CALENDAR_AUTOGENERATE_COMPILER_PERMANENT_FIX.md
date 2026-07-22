# Calendar AUTOGENERATE Compiler Permanent Fix

This release fixes the actual generation path that produced `Manual_TempCalendar`.

## Root cause

The shared M generator handled only FROM, QVD, INLINE and RESIDENT sources. A Qlik `AUTOGENERATE ... WHILE ... IterNo()` operation therefore fell through to `QLIK2PBI.ManualSource`. The separate AI repair engine could propose a reconstructed calendar, but regeneration continued to use the old generator path.

The expression dependency extractor also treated supported functions such as `WeekDay` and `Right` as columns, and the row-expression compiler lacked deterministic translations for those functions.

## Changes

- AUTOGENERATE is now compiled as an executable source before ManualSource fallback.
- Fixed MakeDate variables used with IterNo/WHILE compile to `List.Dates`.
- The generated range is validated before creating the table.
- WeekDay compiles to `Date.DayOfWeekName`.
- Right compiles to `Text.End`.
- Added deterministic mappings for Left, Mid, MakeDate, MonthStart/End, QuarterStart/End, YearStart/End, AddMonths and AddYears.
- Function identifiers are excluded from source-field dependency selection.
- Added an end-to-end regression test proving MasterCalendar contains List.Dates and no ManualSource, WeekDay-column, or Right-column defect.

## Required retest

Delete the previous analysed project state or upload the Qlik package as a new project, then run Analyze and Regenerate. Previously persisted generated M is not rewritten automatically.
