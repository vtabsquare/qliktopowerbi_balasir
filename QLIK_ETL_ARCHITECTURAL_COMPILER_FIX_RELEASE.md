# Qlik ETL Architectural Compiler Fix

This release corrects two compiler-foundation defects found in generated FactSales-style Power Query output.

## 1. Script-order-safe natural joins

Join reconstruction no longer uses operation IDs as execution-order keys. IDs can repeat after INCLUDE expansion or merged parser passes, which previously allowed downstream fields such as SupplierID to leak backward into the target schema before a JOIN.

The compiler now uses the concrete ordered-operation position when reconstructing the target table state. Natural join keys are derived only from fields that truly exist before the current Qlik JOIN. Payload fields remain source-side expansion fields.

Example:

- Join key: ProductID
- Payload: Category, SubCategory, SupplierID

## 2. Immutable Qlik LOAD-row evaluation

All calculated expressions within one Qlik LOAD are now evaluated while the original input columns remain available. Calculations are first written to temporary columns and only then atomically replace their output aliases.

This prevents sibling expressions from losing a source field because an earlier generated step renamed or removed it.

## Validation

- 36 test files passed
- 110 tests passed
- Production client build passed
- Production SSR build passed
