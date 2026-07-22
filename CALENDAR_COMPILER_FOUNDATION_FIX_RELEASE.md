# Calendar Compiler Foundation Fix

## Root cause corrected

The calendar repair engine rebuilt a valid structural query but did not reapply the exact UI-reviewed datatype contract after the final structural step. This caused the deterministic Power Query review to block export even when the calendar M itself was otherwise valid.

## Permanent changes

- Calendar reconstruction now derives the output date column from reviewed metadata.
- All calendar attributes are calculated before the source date column is renamed.
- The final result always reapplies safe value conversions and `Table.TransformColumnTypes`.
- The exact `QLIK2PBI REVIEWED TYPES SIGNATURE` is regenerated from the current datatype registry.
- Quarter and FinancialYear remain text when their values are labels.
- Day remains a whole number and is no longer falsely confused with WeekDay by signature validation.
- WeekDay uses `Date.DayOfWeekName`.
- Display and sort columns are generated in dependency-safe order.
- Date keys are filtered for blanks and deduplicated before authoritative typing.
- Duplicate compiler patch audit entries were removed.

## Generic scope

The implementation uses model metadata and reviewed datatype definitions. It does not hard-code a specific calendar table, fact table, date field, or uploaded project.

## Validation

- 33 test files passed.
- 103 tests passed.
- Client production build passed.
- Server production build passed.
