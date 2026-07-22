# Qlik-to-DAX Semantic Rolling Window Fix

## Root cause
The previous translator rendered nested Qlik functions independently. `RangeSum()` was generically mapped to `SUMX`, while `Above()` was treated as an unsupported child. This could produce scalar-invalid or semantically incorrect DAX and still inherit an excessive confidence score.

## Implemented correction
- Added a high-priority compound semantic conversion stage before generic AST rendering.
- Detects `RangeSum(Above(<aggregate>, 0, <window>))` as one rolling-window calculation.
- Supports `SUM`, `COUNT`, `AVG/AVERAGE`, `MIN`, and `MAX` base aggregations.
- Resolves numeric window literals and static `SET`/`LET` variables through supplied variable metadata.
- Uses Qlik object dimension and sort metadata supplied by the expression inventory builder.
- Generates `DATESINPERIOD` only when a date table, date column, and date granularity are available.
- Refuses calendar DAX when the chart context is absent or categorical, returning a manual-review diagnostic instead.
- Generic `RangeSum()` no longer emits a potentially invalid `SUMX` fallback.
- Confidence is capped at 89 until the calling semantic-validation pipeline explicitly marks comparison as passed. Only then may it reach 100.

## Example
Input:

```qlik
RangeSum(Above(Sum(NetSalesUSD),0,$(vRollingMonths)))
```

With `vRollingMonths = 12` and monthly date context, the generated DAX follows this structure:

```DAX
VAR RollingPeriods = 12
VAR CurrentDate = MAX('Calendar'[Date])
RETURN
    CALCULATE(
        SUM('Sales'[NetSalesUSD]),
        DATESINPERIOD(
            'Calendar'[Date],
            CurrentDate,
            -RollingPeriods,
            MONTH
        )
    )
```

Actual table and field names are resolved from project metadata.

## Changed files
- `src/lib/migration/dax/DaxTranslator.ts`
- `src/lib/migration/dax/DaxTypes.ts`
- `src/lib/migration/expression/analyzers/ExpressionInventoryBuilder.ts`
- `tests/expression-conversion.test.ts`

## Validation
- Full automated test suite: 24 files passed, 83 tests passed.
- Rolling-window regression tests: passed.
- Production client build: passed.
- Production SSR build: passed.

## Deliberate safety behavior
A universal claim of semantic equivalence is not made when Qlik chart ordering, date mapping, missing-period behavior, totals, or runtime sample comparison are unavailable. Such conversions are now blocked from false 100% approval and are clearly marked for manual review.
