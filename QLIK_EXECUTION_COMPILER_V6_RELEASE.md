# Qlik Execution Compiler v6

This release replaces profile/final-schema based join inference with a script-order in-memory table-state simulator.

## Core guarantees
- LOAD * expands only from the resident table snapshot that exists at the operation sequence.
- Natural JOIN keys are only the intersection of the target snapshot before the JOIN and the source LOAD projection.
- Payload fields can never be inferred from final model schemas or datatype metadata.
- Dropped tables remain available historically before their DROP sequence.
- JOIN and CONCATENATE mutate the simulated target state in Qlik execution order.

For the retail regression model, the product join is compiled as:
- Key: ProductID
- Payload: Category, SubCategory, SupplierID
- SalesID survives FactSales_Base -> FactSales_Enriched -> FactSales_Final.
