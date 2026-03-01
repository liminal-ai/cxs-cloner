import { describe, expect, it } from "bun:test";
import type { RolloutLine } from "../../../src/types/codex-session-types.js";
import { SessionBuilder } from "./session-builder.js";

describe("SessionBuilder", () => {
	it("produces a valid RolloutLine array with session_meta", () => {
		const lines = new SessionBuilder().addSessionMeta().build();

		expect(lines).toHaveLength(1);
		expect(lines[0].type).toBe("session_meta");
		expect(lines[0].timestamp).toBeDefined();
		expect(lines[0].payload).toBeDefined();
	});

	it("adds turn_context at the start of each turn", () => {
		const lines = new SessionBuilder().addSessionMeta().addTurn().build();

		// session_meta, turn_context, user message, assistant message
		expect(lines.length).toBeGreaterThanOrEqual(4);
		expect(lines[1].type).toBe("turn_context");
	});

	it("generates correct call_id pairing for function_call pairs", () => {
		const lines = new SessionBuilder()
			.addSessionMeta()
			.addTurn({ functionCalls: 2 })
			.build();

		const fnCalls = lines.filter(
			(l) => l.type === "response_item" && hasType(l, "function_call"),
		);
		const fnOutputs = lines.filter(
			(l) => l.type === "response_item" && hasType(l, "function_call_output"),
		);

		expect(fnCalls).toHaveLength(2);
		expect(fnOutputs).toHaveLength(2);

		// Verify call_id pairing
		for (let i = 0; i < fnCalls.length; i++) {
			const call = fnCalls[i].payload as { call_id: string };
			const output = fnOutputs[i].payload as { call_id: string };
			expect(call.call_id).toBe(output.call_id);
		}
	});

	it("generates correct call_id pairing for custom_tool_call pairs", () => {
		const lines = new SessionBuilder()
			.addSessionMeta()
			.addTurn({ customToolCalls: 1 })
			.build();

		const customCalls = lines.filter(
			(l) => l.type === "response_item" && hasType(l, "custom_tool_call"),
		);
		const customOutputs = lines.filter(
			(l) =>
				l.type === "response_item" && hasType(l, "custom_tool_call_output"),
		);

		expect(customCalls).toHaveLength(1);
		expect(customOutputs).toHaveLength(1);

		const call = customCalls[0].payload as { call_id: string };
		const output = customOutputs[0].payload as { call_id: string };
		expect(call.call_id).toBe(output.call_id);
	});

	it("adds standalone local_shell_call records", () => {
		const lines = new SessionBuilder()
			.addSessionMeta()
			.addTurn({ localShellCalls: 2 })
			.build();

		const shellCalls = lines.filter(
			(l) => l.type === "response_item" && hasType(l, "local_shell_call"),
		);
		expect(shellCalls).toHaveLength(2);
	});

	it("adds standalone web_search_call records", () => {
		const lines = new SessionBuilder()
			.addSessionMeta()
			.addTurn({ webSearchCalls: 1 })
			.build();

		const webSearchCalls = lines.filter(
			(l) => l.type === "response_item" && hasType(l, "web_search_call"),
		);
		expect(webSearchCalls).toHaveLength(1);
	});

	it("adds reasoning records when requested", () => {
		const lines = new SessionBuilder()
			.addSessionMeta()
			.addTurn({ reasoning: true })
			.build();

		const reasoning = lines.filter(
			(l) => l.type === "response_item" && hasType(l, "reasoning"),
		);
		expect(reasoning).toHaveLength(1);
	});

	it("adds event_msg records", () => {
		const lines = new SessionBuilder()
			.addSessionMeta()
			.addTurn({ events: ["user_message", "error"] })
			.build();

		const events = lines.filter((l) => l.type === "event_msg");
		expect(events).toHaveLength(2);
	});

	it("adds compacted records", () => {
		const lines = new SessionBuilder()
			.addSessionMeta()
			.addTurn()
			.addCompactedRecord()
			.addTurn()
			.build();

		const compacted = lines.filter((l) => l.type === "compacted");
		expect(compacted).toHaveLength(1);
	});

	it("supports all tool types in a single turn", () => {
		const lines = new SessionBuilder()
			.addSessionMeta()
			.addTurn({
				functionCalls: 1,
				localShellCalls: 1,
				customToolCalls: 1,
				webSearchCalls: 1,
				reasoning: true,
				events: ["user_message"],
			})
			.build();

		// Should have: session_meta + turn_context + user msg + event + reasoning
		// + fn_call + fn_output + shell + custom_call + custom_output + web_search + assistant msg
		expect(lines.length).toBeGreaterThanOrEqual(12);
	});

	it("produces monotonically increasing timestamps", () => {
		const lines = new SessionBuilder()
			.addSessionMeta()
			.addTurn({ functionCalls: 2 })
			.addTurn({ customToolCalls: 1 })
			.build();

		for (let i = 1; i < lines.length; i++) {
			expect(new Date(lines[i].timestamp).getTime()).toBeGreaterThanOrEqual(
				new Date(lines[i - 1].timestamp).getTime(),
			);
		}
	});
});

/** Helper to check the `type` field on a response_item payload. */
function hasType(line: RolloutLine, typeName: string): boolean {
	const payload = line.payload as { type?: string };
	return payload.type === typeName;
}
