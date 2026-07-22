# Raw Source Staging and Qlik-First Type Foundation

## Root cause corrected

The source staging generator previously applied semantic-model datatype contracts directly to raw CSV/Excel/source queries. This could convert alphanumeric business identifiers such as `SL0000001` to decimal and replace them with `null` before the Qlik LOAD logic executed.

## New invariant

`Source_*` queries preserve raw source values. Types are applied only in these stages:

1. explicit Qlik interpretation functions such as `Num()`, `Date#()`, `Date()`, and `Timestamp#()`;
2. transformation-stage coercion required by joins/calculations; and
3. the final UI-reviewed Power BI datatype contract.

This separates source interpretation from final semantic-model typing and prevents data loss.
