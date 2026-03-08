import type { MessagePayload } from "../types/codex-session-types.js";

/**
 * Extract raw text content from a MessagePayload.
 * Concatenates all text items from the content array.
 */
export function extractMessageText(payload: MessagePayload): string {
	if (!Array.isArray(payload.content)) {
		return "";
	}
	return payload.content
		.map((item) => ("text" in item ? item.text : ""))
		.join("");
}

/**
 * Collapse whitespace runs to a single space and trim.
 */
export function normalizeMessageText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/**
 * Detect Codex bootstrap system prompts (AGENTS.md injections, environment context).
 * Normalizes whitespace internally so callers don't need to pre-normalize.
 */
export function isBootstrapPrompt(text: string): boolean {
	const normalized = normalizeMessageText(text);
	return (
		normalized.startsWith("# AGENTS.md instructions for ") ||
		(normalized.includes("<INSTRUCTIONS>") &&
			normalized.includes("<environment_context>"))
	);
}
