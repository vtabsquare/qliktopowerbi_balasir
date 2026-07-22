import { answerDeterministically } from "./deterministic-agent";
import type { AgentMessageRequest, MigrationAgentAnswer } from "./types";

export async function sendMigrationAgentMessage(request: AgentMessageRequest): Promise<MigrationAgentAnswer> {
  try {
    const response = await fetch("/api/agent/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (response.ok) return await response.json() as MigrationAgentAnswer;
  } catch {
    // Offline/local deterministic fallback is intentional.
  }
  return answerDeterministically(request.context);
}
