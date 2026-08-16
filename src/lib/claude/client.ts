import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// One client for the whole server. The key is the app owner's — it must never
// be imported from a client component ("server-only" makes that a build error).
export const anthropic = new Anthropic();

export const MODEL = "claude-sonnet-4-6";

/** Map SDK failures to a sentence a non-programmer can act on. */
export function friendlyClaudeError(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) {
    return "The AI service is busy right now — wait a minute and try again.";
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return "The server's AI key isn't working. Tell the app owner.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the AI service — check the internet connection and retry.";
  }
  if (error instanceof Anthropic.APIError) {
    return `AI service error (${error.status}). Try again shortly.`;
  }
  return error instanceof Error ? error.message : "Something unexpected went wrong.";
}

/** Pull a JSON object out of model text, tolerating stray prose or code fences. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("The AI didn't return structured data. Try again.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export function firstText(blocks: Anthropic.ContentBlock[]): string {
  for (const block of blocks) {
    if (block.type === "text") return block.text;
  }
  return "";
}
