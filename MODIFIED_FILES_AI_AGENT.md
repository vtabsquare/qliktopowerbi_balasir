# Modified files — embedded Migration AI Assistant

## Added
- `src/lib/migration/agent/types.ts`
- `src/lib/migration/agent/deterministic-agent.ts`
- `src/lib/migration/agent/client.ts`
- `src/components/migration/MigrationAiAssistant.tsx`
- `tests/migration-ai-agent.test.ts`
- `.env.example`
- `AI_MIGRATION_AGENT_RELEASE.md`
- `AGENT_SECURITY_AND_OPERATIONS.md`

## Updated
- `src/routes/app.tsx` — mounts the assistant on every authenticated migration page.
- `src/server.ts` — adds the server-only `/api/agent/message` provider endpoint and CSP support.

## Compatibility
The existing parser, input classifier, QVS final-table reconstruction, QVD lineage, datatype governance, Power Query diagnostics, DAX translation, relationship model and PBIP export remain in place.
