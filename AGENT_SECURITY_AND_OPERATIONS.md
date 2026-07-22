# Agent security and operations

1. Keep provider credentials only in server runtime variables.
2. Restrict project context to the active authenticated project.
3. Do not add arbitrary shell, SQL or filesystem tools to the agent.
4. Require approval before applying M, DAX, datatype, relationship or security changes.
5. Rebuild and validate affected artifacts after any approved change.
6. Keep PBIP export blocked while deterministic blocking diagnostics exist.
7. Review provider retention, regional processing and enterprise privacy settings before production use.
8. Apply request, token and cost limits at the deployment gateway.
