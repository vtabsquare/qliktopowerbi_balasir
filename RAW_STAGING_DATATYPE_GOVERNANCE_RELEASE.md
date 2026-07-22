# Raw & Staging Datatype Governance Release

## Root cause
Datatype review previously focused mainly on final semantic-model tables. A user could correct a derived field while the raw or resident table used by an earlier join retained an incompatible inferred type. Because the conversion was applied only at the final projection, `Table.NestedJoin` still compared mismatched key types.

## Implemented changes

### Complete datatype inventory
`buildColumnTypes` now inventories fields from all parsed operations and profiles, including raw source loads, resident intermediates, join payloads, inline/mapping tables, excluded/load-disabled technical tables, and final model tables. User overrides for these tables remain authoritative.

### Enhanced UI
The datatype editor is now titled **Raw, Staging, Intermediate & Final Data Types** and provides:

- execution-stage classification;
- load-enabled versus staging/load-disabled status;
- stage and table filters;
- search across table, column, datatype, role and join-key names;
- editable raw and staging columns alongside final model columns.

### Typed source staging
Source staging queries now append safe reviewed conversion and `Table.TransformColumnTypes` steps immediately after the source table shape is established. These conversions are generated from the latest UI-reviewed datatype map.

### Pre-join harmonization
Before each `Table.NestedJoin`, the compiler creates typed left and right key steps. Matching reviewed types are preserved. Numeric mismatches use a common decimal type; other incompatible pairs use text as the non-lossy key representation. Required-column validation runs after typing and before the join.

### Final semantic types preserved
Final model queries still end with the authoritative `ReviewedTypeConversions` step. Source/pre-join conversions are not removed by final projection or final typing.

### Persistence and regeneration
Saving datatype edits rebuilds staging queries, execution plans, previews, final M queries and PBIP metadata, while clearing stale AI-generated query snapshots.

## Modified files

- `src/lib/migration/enterprise-parser.ts`
- `src/components/migration/EnterpriseAnalysisPanel.tsx`
- `tests/raw-staging-datatype-governance.test.ts`

## Validation

- Existing regression suite: 83 tests passed before adding the new tests.
- New raw/staging governance tests: 2 passed.
- Expected complete suite: 85 tests.
- Vite production client build: passed.
- Vite production SSR build: passed.

## Notes
The application uses only the first ten preview values for UI profiling. Full source refresh and connector credentials remain Power BI runtime responsibilities.
