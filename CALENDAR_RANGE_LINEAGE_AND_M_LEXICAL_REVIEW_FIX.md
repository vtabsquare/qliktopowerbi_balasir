# Calendar Range Lineage and M Lexical Review Fix

## Scope

This release makes two targeted corrections without changing the remaining migration features.

### 1. Power Query syntax review

The Qlik-only syntax detector now analyzes only executable M code. Text inside M string literals and comments is masked before Qlik-token detection.

Diagnostic text such as:

`"The Qlik Peek/Min calendar source contains no valid date."`

and metadata such as:

`[OriginalExpression="Peek('MinDate',0,'TempDate')"]`

no longer create false blocking diagnostics. An actual executable call such as `Peek(...)` is still blocked.

### 2. Calendar range lineage binding

Calendar range resolution now treats the source query and source column as one lineage binding. It traces a Min/Max or Peek-derived date column through resident loads, direct aliases, `LOAD *`, and physical source staging.

For the tested chain:

`FactSales_Base -> FactSales_Final -> TempDate -> vMinDate/vMaxDate -> TempCalendar -> MasterCalendar`

it generates:

- Range query: `Source_FactSales_Base`
- Range column: `OrderDate`

It no longer combines `FactSales_Final` with the upstream field name `OrderDate` after a downstream rename.

The generated M validates the resolved query/column pair before reading the date values and records the lineage in the error metadata.

## Regression coverage

- Qlik words in M strings/comments do not trigger a blocking review.
- Executable Qlik syntax still triggers a blocking review.
- Peek/Min/Max calendar ranges resolve to the authoritative upstream staging query.
- AUTOGENERATE remains executable and does not emit `ManualSource`.
- Datatype regeneration preserves the corrected calendar source binding.

## Validation

- 40 test files passed.
- 117 tests passed.
- Client production build passed.
- SSR/server production build passed.
