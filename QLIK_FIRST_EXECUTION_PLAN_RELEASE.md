# Qlik-first Execution Plan and Clean M Release

This release changes report-table conversion from inline table replay to operation-scoped helper queries. The UI now displays the approved Qlik execution plan and join contracts before the generated M editor.

## Key changes
- Dedicated load-disabled `JoinPayload_<OperationId>` queries.
- Fact queries reference payload helpers instead of rebuilding complete dimension transformations.
- Natural join keys and payload fields remain separate.
- The execution plan is visible in the Power Query UI.
- Existing reviewed datatype contracts remain the final query step.

## Validation
The regression suite verifies that dimension transformation steps do not leak into fact queries and that payload fields are never treated as target-side join keys.
