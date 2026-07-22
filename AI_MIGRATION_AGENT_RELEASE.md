# Embedded Migration AI Assistant

This release adds a page-aware Migration AI Assistant without replacing the deterministic migration pipeline.

## Architecture

React assistant panel → `/api/agent/message` → server-only AI provider → grounded response.

When `OPENAI_API_KEY` is absent or the provider is unavailable, the UI uses a deterministic project-evidence assistant. The fallback can list final tables, explain lineage and diagnose known validation errors without sending project data externally.

## Safety and governance

- API keys remain server-side.
- Uploaded Qlik content is treated as untrusted data.
- The assistant receives a compact project context, not the unrestricted filesystem.
- Responses display evidence, impact, required validation and confidence.
- Error-oriented answers may create a governed proposal, but do not automatically modify project state.
- Existing QVS, QVW/PRJ, QVD lineage, datatype, M, DAX, model and PBIP logic is preserved.
- AI-generated output is never labeled semantically verified without reconciliation.

## Configuration

Copy `.env.example` to `.env` and set:

```env
OPENAI_API_KEY=your-server-side-key
OPENAI_MODEL=gpt-5-mini
```

Do not use `VITE_OPENAI_API_KEY`.

## Run

```powershell
npm ci
npm run dev
```
