# ChatGPT-like AI Error Correction Release

This release extends the embedded Migration AI Assistant from explanation-only guidance into a governed correction workflow.

## Implemented

- Error cards with **Explain Error** and **Fix with AI** actions.
- Grounded correction proposals generated from the current diagnostic, generated M, available queries, schema profiles, and project version.
- Root-cause summary, risk, confidence, evidence, affected objects, and validation plan.
- Before-and-after Power Query display.
- Approval-gated **Apply AI Fix** action.
- Minimal query-reference patches, missing-query proposals, duplicate-expansion corrections, schema-regeneration recommendations, and DAX manual-review routing.
- Project-state snapshot and rollback.
- Post-application structural and dependency validation.
- Explicit `Reconciliation Required` state; code generation alone is never marked semantically verified.

## Safety model

The correction engine prefers canonical metadata and query dependency corrections. High-risk or insufficiently grounded changes remain in `Manual Review Required`. Runtime preview, data reconciliation, and PBIP refresh are retained as pending gates when they cannot be executed locally.

## Modified files

- `src/lib/migration/agent/correction-engine.ts`
- `src/lib/migration/agent/correction-client.ts`
- `src/components/migration/MigrationAiAssistant.tsx`
- `tests/ai-correction-engine.test.ts`
- `AI_ERROR_CORRECTION_RELEASE.md`

## Validation

- Unit and regression tests passed.
- Client production build passed.
- SSR production build passed.
