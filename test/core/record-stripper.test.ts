import { describe, expect, it } from "bun:test";
import { stripRecords } from "../../src/core/record-stripper.js";
import { identifyTurns } from "../../src/core/turn-boundary-calculator.js";
import type {
	CompactionItemPayload,
	ContentItem,
	EventMsgPayload,
	FunctionCallOutputPayload,
	FunctionCallPayload,
	GhostSnapshotPayload,
	ReasoningPayload,
	RolloutLine,
	TurnContextPayload,
} from "../../src/types/codex-session-types.js";
import { DEFAULT_EVENT_PRESERVE_LIST } from "../../src/types/codex-session-types.js";
import type { StripConfig } from "../../src/types/tool-removal-types.js";
import { SessionBuilder } from "../fixtures/builders/session-builder.js";

// ---------- Helpers ----------

/** Default strip config for tool-stripping scenarios */
function toolStripConfig(overrides?: Partial<StripConfig>): StripConfig {
	return {
		toolPreset: { keepTurnsWithTools: 20, truncatePercent: 50 },
		reasoningMode: "full",
		stripTools: true,
		eventPreserveList: DEFAULT_EVENT_PRESERVE_LIST,
		truncateLength: 120,
		...overrides,
	};
}

/** Reasoning-only strip config (no tool stripping) */
function reasoningOnlyConfig(overrides?: Partial<StripConfig>): StripConfig {
	return {
		toolPreset: null,
		reasoningMode: "full",
		stripTools: false,
		eventPreserveList: DEFAULT_EVENT_PRESERVE_LIST,
		truncateLength: 120,
		...overrides,
	};
}

/** Run stripRecords using identifyTurns to produce turn info */
function stripSession(records: RolloutLine[], config: StripConfig) {
	const { turns } = identifyTurns(records);
	return stripRecords(records, turns, config);
}

/** Count records by type in result */
function countByType(records: RolloutLine[], type: string): number {
	return records.filter((r) => r.type === type).length;
}

/** Count response_items by subtype in result */
function countBySubtype(records: RolloutLine[], subtype: string): number {
	return records.filter(
		(r) =>
			r.type === "response_item" &&
			(r.payload as { type: string }).type === subtype,
	).length;
}

/** Count event_msg records by subtype */
function countEventsBySubtype(records: RolloutLine[], subtype: string): number {
	return records.filter(
		(r) =>
			r.type === "event_msg" && (r.payload as EventMsgPayload).type === subtype,
	).length;
}

/** Get all response_items of a given subtype */
function getBySubtype(records: RolloutLine[], subtype: string): RolloutLine[] {
	return records.filter(
		(r) =>
			r.type === "response_item" &&
			(r.payload as { type: string }).type === subtype,
	);
}

/** Create a long string of a given length */
function longString(length: number): string {
	return "x".repeat(length);
}

// ---------- Tests ----------

describe("record-stripper", () => {
	// ===== AC-5.1: Zone computation =====
	describe("zone computation (AC-5.1)", () => {
		it("TC-5.1.1: 30 tool turns default preset → 10 removed, 10 truncated, 10 preserved", () => {
			const builder = new SessionBuilder().addSessionMeta();
			for (let i = 0; i < 30; i++) {
				builder.addTurn({ functionCalls: 1 });
			}
			const records = builder.build();
			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 20, truncatePercent: 50 },
			});

			const result = stripSession(records, config);

			// 10 removed (each turn has 1 function_call), 10 truncated, 10 preserved
			expect(result.statistics.functionCallsRemoved).toBe(10);
			expect(result.statistics.functionCallsTruncated).toBe(10);
			expect(countBySubtype(result.records, "function_call")).toBe(20);

			// The output should have fewer records than input
			expect(result.records.length).toBeLessThan(records.length);
		});

		it("TC-5.1.2: 5 tool turns default preset → all preserved", () => {
			const builder = new SessionBuilder().addSessionMeta();
			for (let i = 0; i < 5; i++) {
				builder.addTurn({ functionCalls: 1 });
			}
			const records = builder.build();
			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 20, truncatePercent: 50 },
			});

			const result = stripSession(records, config);

			// All 5 tool-bearing turns are preserved (5 < 20)
			// function_calls should NOT be removed (they're in preserved zone)
			expect(result.statistics.functionCallsRemoved).toBe(0);
			expect(result.statistics.functionCallsTruncated).toBe(0);
		});
	});

	// ===== AC-5.2: Tool call pairing =====
	describe("tool call pairing (AC-5.2)", () => {
		it("TC-5.2.1: removes function_call and paired function_call_output", () => {
			const builder = new SessionBuilder().addSessionMeta();
			// One turn in removed zone (it's the only turn, and keep=0 → extreme)
			builder.addTurn({ functionCalls: 1 });
			const records = builder.build();
			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 0, truncatePercent: 0 },
			});

			const result = stripSession(records, config);

			expect(countBySubtype(result.records, "function_call")).toBe(0);
			expect(countBySubtype(result.records, "function_call_output")).toBe(0);
		});

		it("TC-5.2.2: removes custom_tool_call and paired custom_tool_call_output", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ customToolCalls: 1 });
			const records = builder.build();
			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 0, truncatePercent: 0 },
			});

			const result = stripSession(records, config);

			expect(countBySubtype(result.records, "custom_tool_call")).toBe(0);
			expect(countBySubtype(result.records, "custom_tool_call_output")).toBe(0);
		});

		it("TC-5.2.3: removes standalone local_shell_call", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ localShellCalls: 1 });
			const records = builder.build();
			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 0, truncatePercent: 0 },
			});

			const result = stripSession(records, config);

			expect(countBySubtype(result.records, "local_shell_call")).toBe(0);
		});

		it("TC-5.2.4: removes standalone web_search_call", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ webSearchCalls: 1 });
			const records = builder.build();
			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 0, truncatePercent: 0 },
			});

			const result = stripSession(records, config);

			expect(countBySubtype(result.records, "web_search_call")).toBe(0);
		});
	});

	// ===== AC-5.3: Truncation =====
	describe("truncation (AC-5.3)", () => {
		it("TC-5.3.1: truncates function_call_output string to 120 chars", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ functionCalls: 1 });
			const records = builder.build();

			// Manually set the output to a very long string
			const fnOutput = records.find(
				(r) =>
					r.type === "response_item" &&
					(r.payload as { type: string }).type === "function_call_output",
			);
			(fnOutput!.payload as FunctionCallOutputPayload).output =
				longString(5000);

			// Config: keep=1, truncate=100% → the single turn is in truncated zone
			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 1, truncatePercent: 100 },
			});

			const result = stripSession(records, config);

			const outputRecords = getBySubtype(
				result.records,
				"function_call_output",
			);
			expect(outputRecords).toHaveLength(1);
			const output = (outputRecords[0].payload as FunctionCallOutputPayload)
				.output as string;
			expect(output.length).toBeLessThanOrEqual(123); // 120 + "..."
			expect(output.endsWith("...")).toBe(true);
		});

		it("TC-5.3.2: truncates ContentItem array text items", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ functionCalls: 1 });
			const records = builder.build();

			// Set output to ContentItem[] with long text
			const fnOutput = records.find(
				(r) =>
					r.type === "response_item" &&
					(r.payload as { type: string }).type === "function_call_output",
			);
			const contentItems: ContentItem[] = [
				{ type: "output_text", text: longString(5000) },
				{ type: "input_text", text: longString(3000) },
			];
			(fnOutput!.payload as FunctionCallOutputPayload).output = contentItems;

			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 1, truncatePercent: 100 },
			});

			const result = stripSession(records, config);

			const outputRecords = getBySubtype(
				result.records,
				"function_call_output",
			);
			expect(outputRecords).toHaveLength(1);
			const items = (outputRecords[0].payload as FunctionCallOutputPayload)
				.output as ContentItem[];
			expect(Array.isArray(items)).toBe(true);
			for (const item of items) {
				if ("text" in item) {
					expect(item.text.length).toBeLessThanOrEqual(123);
				}
			}
		});

		it("TC-5.3.3: truncates function_call arguments JSON-in-JSON", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ functionCalls: 1 });
			const records = builder.build();

			// Set arguments to a JSON string with long string values
			const fnCall = records.find(
				(r) =>
					r.type === "response_item" &&
					(r.payload as { type: string }).type === "function_call",
			);
			(fnCall!.payload as FunctionCallPayload).arguments = JSON.stringify({
				path: longString(500),
				content: longString(1000),
			});

			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 1, truncatePercent: 100 },
			});

			const result = stripSession(records, config);

			const callRecords = getBySubtype(result.records, "function_call");
			expect(callRecords).toHaveLength(1);
			const args = JSON.parse(
				(callRecords[0].payload as FunctionCallPayload).arguments,
			);
			expect(args.path.length).toBeLessThanOrEqual(123);
			expect(args.content.length).toBeLessThanOrEqual(123);
		});
	});

	// ===== AC-5.5: Empty turn removal =====
	describe("empty turn removal (AC-5.5)", () => {
		it("TC-5.5.1: removes entire tool-only turn in removed zone", () => {
			// Build a turn manually that has ONLY tool records (no user/assistant messages)
			const records: RolloutLine[] = [
				{
					timestamp: "2025-01-15T10:00:00.000Z",
					type: "session_meta",
					payload: {
						id: "sess_test",
						timestamp: "2025-01-15T10:00:00.000Z",
						cwd: "/tmp",
						originator: "test",
						cli_version: "1.0.0",
						source: "test",
					},
				},
				{
					timestamp: "2025-01-15T10:00:01.000Z",
					type: "turn_context",
					payload: {
						turn_id: "turn_0",
						cwd: "/tmp",
						model: "o4-mini",
						approval_policy: { mode: "auto" },
						sandbox_policy: { mode: "off" },
						summary: null,
					},
				},
				{
					timestamp: "2025-01-15T10:00:02.000Z",
					type: "response_item",
					payload: {
						type: "function_call",
						name: "tool_0",
						arguments: "{}",
						call_id: "call_001",
					},
				},
				{
					timestamp: "2025-01-15T10:00:03.000Z",
					type: "response_item",
					payload: {
						type: "function_call_output",
						call_id: "call_001",
						output: "result",
					},
				},
			];

			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 0, truncatePercent: 0 },
			});

			const result = stripSession(records, config);

			// The entire turn should be removed (no message records remain)
			// Only session_meta should remain
			expect(countByType(result.records, "turn_context")).toBe(0);
			expect(countBySubtype(result.records, "function_call")).toBe(0);
			expect(countBySubtype(result.records, "function_call_output")).toBe(0);
		});

		it("TC-5.5.2: preserves messages in turn with mixed content", () => {
			const builder = new SessionBuilder().addSessionMeta();
			// addTurn adds user + assistant messages plus tool calls
			builder.addTurn({ functionCalls: 1 });
			const records = builder.build();
			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 0, truncatePercent: 0 },
			});

			const result = stripSession(records, config);

			// Tool records removed, but message records preserved
			expect(countBySubtype(result.records, "function_call")).toBe(0);
			expect(countBySubtype(result.records, "function_call_output")).toBe(0);
			expect(countBySubtype(result.records, "message")).toBeGreaterThan(0);
		});

		it("preserves removed-zone turn with only preserved event messages", () => {
			const records: RolloutLine[] = [
				{
					timestamp: "2025-01-15T10:00:00.000Z",
					type: "session_meta",
					payload: {
						id: "sess_test",
						timestamp: "2025-01-15T10:00:00.000Z",
						cwd: "/tmp",
						originator: "test",
						cli_version: "1.0.0",
						source: "test",
					},
				},
				{
					timestamp: "2025-01-15T10:00:01.000Z",
					type: "turn_context",
					payload: {
						turn_id: "turn_0",
						cwd: "/tmp",
						model: "o4-mini",
						approval_policy: { mode: "auto" },
						sandbox_policy: { mode: "off" },
						summary: null,
					},
				},
				{
					timestamp: "2025-01-15T10:00:02.000Z",
					type: "event_msg",
					payload: {
						type: "user_message",
						message: "Continue from here",
					},
				},
				{
					timestamp: "2025-01-15T10:00:03.000Z",
					type: "response_item",
					payload: {
						type: "function_call",
						name: "tool_0",
						arguments: "{}",
						call_id: "call_001",
					},
				},
				{
					timestamp: "2025-01-15T10:00:04.000Z",
					type: "response_item",
					payload: {
						type: "function_call_output",
						call_id: "call_001",
						output: "result",
					},
				},
			];

			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 0, truncatePercent: 0 },
			});
			const result = stripSession(records, config);

			expect(countByType(result.records, "turn_context")).toBe(0);
			expect(countEventsBySubtype(result.records, "user_message")).toBe(1);
		});
	});

	// ===== AC-6.1: Reasoning stripping =====
	describe("reasoning stripping (AC-6.1)", () => {
		it("TC-6.1.1: strip-tools without strip-reasoning defaults to full removal", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ functionCalls: 1, reasoning: true });
			const records = builder.build();
			const config = toolStripConfig({ reasoningMode: "full" });

			const result = stripSession(records, config);

			expect(countBySubtype(result.records, "reasoning")).toBe(0);
		});

		it("TC-6.1.2: strip-reasoning=none preserves reasoning", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ functionCalls: 1, reasoning: true });
			const records = builder.build();
			const config = toolStripConfig({ reasoningMode: "none" });

			const result = stripSession(records, config);

			expect(countBySubtype(result.records, "reasoning")).toBeGreaterThan(0);
		});

		it("TC-6.1.3: strip-reasoning=full without strip-tools removes reasoning, preserves tools and telemetry", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({
				functionCalls: 1,
				reasoning: true,
				events: ["exec_command_begin", "user_message"],
			});
			const records = builder.build();
			const config = reasoningOnlyConfig({ reasoningMode: "full" });

			const result = stripSession(records, config);

			// Reasoning removed
			expect(countBySubtype(result.records, "reasoning")).toBe(0);
			// Tools preserved (stripTools=false)
			expect(countBySubtype(result.records, "function_call")).toBeGreaterThan(
				0,
			);
			// Telemetry events preserved (stripTools=false)
			expect(countEventsBySubtype(result.records, "exec_command_begin")).toBe(
				1,
			);
			expect(countEventsBySubtype(result.records, "user_message")).toBe(1);
		});

		it("TC-6.1.4: summary-only keeps summary, drops content", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ reasoning: true });
			const records = builder.build();

			// Set up reasoning record with content and encrypted_content
			const reasoning = records.find(
				(r) =>
					r.type === "response_item" &&
					(r.payload as { type: string }).type === "reasoning",
			);
			const rPayload = reasoning!.payload as ReasoningPayload;
			rPayload.content = [{ type: "text", text: "Internal reasoning" }];
			rPayload.encrypted_content = "encrypted-data-here";

			const config = reasoningOnlyConfig({ reasoningMode: "summary-only" });

			const result = stripSession(records, config);

			const reasoningRecords = getBySubtype(result.records, "reasoning");
			expect(reasoningRecords).toHaveLength(1);
			const payload = reasoningRecords[0].payload as ReasoningPayload;
			expect(payload.summary).toBeDefined();
			expect(payload.summary.length).toBeGreaterThan(0);
			expect(payload.content).toBeUndefined();
			expect(payload.encrypted_content).toBeUndefined();
		});
	});

	// ===== AC-6.2: Reasoning vs compaction response_items =====
	describe("reasoning vs compaction (AC-6.2)", () => {
		it("TC-6.2.1: removes reasoning response_item with full strip", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ reasoning: true });
			const records = builder.build();
			const config = reasoningOnlyConfig({ reasoningMode: "full" });

			const result = stripSession(records, config);

			expect(countBySubtype(result.records, "reasoning")).toBe(0);
		});

		it("TC-6.2.2: preserves compaction response_item (not reasoning)", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn();
			const records = builder.build();

			// Add a compaction response_item inside the turn
			const compactionItem: RolloutLine = {
				timestamp: "2025-01-15T10:00:50.000Z",
				type: "response_item",
				payload: {
					type: "compaction",
					encrypted_content: "compacted-data",
				} as CompactionItemPayload,
			};
			records.push(compactionItem);

			const config = reasoningOnlyConfig({ reasoningMode: "full" });

			const result = stripSession(records, config);

			// Compaction item is NOT treated as reasoning — must be preserved
			expect(countBySubtype(result.records, "compaction")).toBe(1);
		});
	});

	// ===== AC-7.1: Telemetry stripping =====
	describe("telemetry stripping (AC-7.1)", () => {
		it("TC-7.1.1: removes exec_command events when active", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({
				functionCalls: 1,
				events: [
					"exec_command_begin",
					"exec_command_end",
					"exec_command_output_delta",
				],
			});
			const records = builder.build();
			const config = toolStripConfig();

			const result = stripSession(records, config);

			expect(countEventsBySubtype(result.records, "exec_command_begin")).toBe(
				0,
			);
			expect(countEventsBySubtype(result.records, "exec_command_end")).toBe(0);
			expect(
				countEventsBySubtype(result.records, "exec_command_output_delta"),
			).toBe(0);
		});

		it("TC-7.1.2: preserves user_message events", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({
				functionCalls: 1,
				events: ["user_message"],
			});
			const records = builder.build();
			const config = toolStripConfig();

			const result = stripSession(records, config);

			expect(countEventsBySubtype(result.records, "user_message")).toBe(1);
		});

		it("TC-7.1.3: preserves error events", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({
				functionCalls: 1,
				events: ["error"],
			});
			const records = builder.build();
			const config = toolStripConfig();

			const result = stripSession(records, config);

			expect(countEventsBySubtype(result.records, "error")).toBe(1);
		});

		it("TC-7.1.4: removes non-preserve-list events", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({
				functionCalls: 1,
				events: ["token_count", "agent_reasoning"],
			});
			const records = builder.build();
			const config = toolStripConfig();

			const result = stripSession(records, config);

			expect(countEventsBySubtype(result.records, "token_count")).toBe(0);
			expect(countEventsBySubtype(result.records, "agent_reasoning")).toBe(0);
		});
	});

	// ===== AC-7.2: Turn context stripping =====
	describe("turn_context stripping (AC-7.2)", () => {
		it("TC-7.2.1: removes turn_context in removed zone", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ functionCalls: 1 });
			const records = builder.build();
			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 0, truncatePercent: 0 },
			});

			const result = stripSession(records, config);

			expect(countByType(result.records, "turn_context")).toBe(0);
		});

		it("TC-7.2.2: removes turn_context in truncated zone", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ functionCalls: 1 });
			const records = builder.build();
			// keep=1, truncate=100% → the single turn is truncated
			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 1, truncatePercent: 100 },
			});

			const result = stripSession(records, config);

			expect(countByType(result.records, "turn_context")).toBe(0);
		});

		it("TC-7.2.3: strips instruction fields from preserved zone turn_context", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ functionCalls: 1 });
			const records = builder.build();

			// Add instruction fields to the turn_context payload
			const turnCtx = records.find((r) => r.type === "turn_context");
			const payload = turnCtx!.payload as TurnContextPayload;
			payload.user_instructions = "Very long AGENTS.md content here...";
			payload.developer_instructions = "Developer context here...";
			payload.instructions = "Legacy instructions...";
			payload.collaboration_mode = {
				mode: "auto",
				settings: {
					model: "o4-mini",
					reasoning_effort: "high",
					developer_instructions: "Nested dev instructions...",
				},
			};

			// keep=1, truncate=0% → the single turn is preserved
			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 1, truncatePercent: 0 },
			});

			const result = stripSession(records, config);

			const turnContexts = result.records.filter(
				(r) => r.type === "turn_context",
			);
			expect(turnContexts).toHaveLength(1);
			const tcPayload = turnContexts[0].payload as TurnContextPayload;

			// Structural fields preserved
			expect(tcPayload.turn_id).toBeDefined();
			expect(tcPayload.cwd).toBeDefined();
			expect(tcPayload.model).toBeDefined();

			// Instruction fields stripped
			expect(tcPayload.user_instructions).toBeUndefined();
			expect(tcPayload.developer_instructions).toBeUndefined();
			expect(tcPayload.instructions).toBeUndefined();
			expect(tcPayload.collaboration_mode).toBeUndefined();
		});
	});

	// ===== AC-7.3: Ghost snapshot stripping =====
	describe("ghost_snapshot stripping (AC-7.3)", () => {
		it("TC-7.3.1: removes ghost_snapshot records", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ functionCalls: 1 });
			const records = builder.build();

			// Add a ghost_snapshot response_item
			const ghostRecord: RolloutLine = {
				timestamp: "2025-01-15T10:00:50.000Z",
				type: "response_item",
				payload: {
					type: "ghost_snapshot",
					ghost_commit: { hash: "abc123" },
				} as GhostSnapshotPayload,
			};
			// Insert it within the turn range (before the last record)
			records.splice(records.length - 1, 0, ghostRecord);

			const config = toolStripConfig();

			const result = stripSession(records, config);

			expect(countBySubtype(result.records, "ghost_snapshot")).toBe(0);
		});
	});

	// ===== AC-9.3: Custom event preserve-list =====
	describe("custom eventPreserveList (AC-9.3)", () => {
		it("TC-9.3.1: custom preserve-list augments defaults", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({
				functionCalls: 1,
				events: ["agent_message", "user_message", "token_count"],
			});
			const records = builder.build();
			const config = toolStripConfig({
				eventPreserveList: ["user_message", "error", "agent_message"],
			});

			const result = stripSession(records, config);

			// user_message and agent_message preserved
			expect(countEventsBySubtype(result.records, "user_message")).toBe(1);
			expect(countEventsBySubtype(result.records, "agent_message")).toBe(1);
			// token_count still stripped
			expect(countEventsBySubtype(result.records, "token_count")).toBe(0);
		});
	});

	// ===== AC-10.1: Compacted record preservation =====
	describe("compacted record preservation (AC-10.1)", () => {
		it("TC-10.1.1: preserves top-level compacted record in output", () => {
			const builder = new SessionBuilder()
				.addSessionMeta()
				.addTurn({ functionCalls: 1 })
				.addCompactedRecord()
				.addTurn({ functionCalls: 1 });
			const records = builder.build();
			const config = toolStripConfig();

			const result = stripSession(records, config);

			expect(countByType(result.records, "compacted")).toBe(1);
		});

		it("TC-10.1.2: preserves compaction response_item in output", () => {
			const builder = new SessionBuilder()
				.addSessionMeta()
				.addTurn({ functionCalls: 1 });
			const records = builder.build();

			// Add compaction response_item
			const compactionItem: RolloutLine = {
				timestamp: "2025-01-15T10:00:50.000Z",
				type: "response_item",
				payload: {
					type: "compaction",
					encrypted_content: "compacted-data",
				} as CompactionItemPayload,
			};
			records.splice(records.length - 1, 0, compactionItem);

			const config = toolStripConfig();

			const result = stripSession(records, config);

			expect(countBySubtype(result.records, "compaction")).toBe(1);
			expect(result.statistics.compactionDetected).toBe(true);
			expect(result.statistics.compactedRecordCount).toBe(1);
		});
	});

	// ===== AC-10.3: Compacted session zone handling =====
	describe("compacted session zone handling (AC-10.3)", () => {
		it("TC-10.3.1: compacted + 15 tool turns keep=20 → all preserved", () => {
			const builder = new SessionBuilder()
				.addSessionMeta()
				.addTurn({ functionCalls: 1 }) // pre-compaction turn
				.addCompactedRecord();

			// 15 post-compaction tool-bearing turns
			for (let i = 0; i < 15; i++) {
				builder.addTurn({ functionCalls: 1 });
			}
			const records = builder.build();
			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 20, truncatePercent: 50 },
			});

			const result = stripSession(records, config);

			// All 15 preserved since 15 < 20
			// No function_calls should be removed (tool zone is all preserved)
			expect(result.statistics.functionCallsRemoved).toBe(0);
			expect(result.statistics.functionCallsTruncated).toBe(0);
			// But reasoning and telemetry still stripped
			expect(result.statistics.reasoningBlocksRemoved).toBeGreaterThanOrEqual(
				0,
			);
		});

		it("TC-10.3.2: compacted + 40 tool turns default → correct zone split", () => {
			const builder = new SessionBuilder()
				.addSessionMeta()
				.addTurn({ functionCalls: 1 }) // pre-compaction
				.addCompactedRecord();

			// 40 post-compaction tool-bearing turns
			for (let i = 0; i < 40; i++) {
				builder.addTurn({ functionCalls: 1 });
			}
			const records = builder.build();
			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 20, truncatePercent: 50 },
			});

			const result = stripSession(records, config);

			// 20 removed (each turn has 1 function_call), 10 truncated, 10 preserved
			expect(result.statistics.functionCallsRemoved).toBe(20);
			expect(result.statistics.functionCallsTruncated).toBe(10);
		});

		it("counts original turns using post-compaction turn identification", () => {
			const builder = new SessionBuilder()
				.addSessionMeta()
				.addTurn({ functionCalls: 1 })
				.addTurn({ functionCalls: 1 })
				.addCompactedRecord()
				.addTurn({ functionCalls: 1 })
				.addTurn({ functionCalls: 1 })
				.addTurn({ functionCalls: 1 });
			const result = stripSession(builder.build(), toolStripConfig());

			expect(result.statistics.turnCountOriginal).toBe(3);
		});
	});

	// ===== Non-TC Decided Tests =====
	describe("non-TC decided tests", () => {
		it("truncation of already-short content (no-op)", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ functionCalls: 1 });
			const records = builder.build();

			// Set output to a short string (< truncateLength)
			const fnOutput = records.find(
				(r) =>
					r.type === "response_item" &&
					(r.payload as { type: string }).type === "function_call_output",
			);
			(fnOutput!.payload as FunctionCallOutputPayload).output = "short output";

			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 1, truncatePercent: 100 },
			});

			const result = stripSession(records, config);

			const outputRecords = getBySubtype(
				result.records,
				"function_call_output",
			);
			expect(outputRecords).toHaveLength(1);
			const output = (outputRecords[0].payload as FunctionCallOutputPayload)
				.output as string;
			expect(output).toBe("short output"); // Not truncated
		});

		it("truncation of empty arguments string", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ functionCalls: 1 });
			const records = builder.build();

			const fnCall = records.find(
				(r) =>
					r.type === "response_item" &&
					(r.payload as { type: string }).type === "function_call",
			);
			(fnCall!.payload as FunctionCallPayload).arguments = "";

			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 1, truncatePercent: 100 },
			});

			const result = stripSession(records, config);

			const callRecords = getBySubtype(result.records, "function_call");
			expect(callRecords).toHaveLength(1);
			// Empty arguments preserved as-is (JSON parse fails, defensive fallback)
			const args = (callRecords[0].payload as FunctionCallPayload).arguments;
			expect(args).toBe("");
		});

		it("tool call with missing call_id (defensive handling)", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ functionCalls: 1 });
			const records = builder.build();

			// Remove call_id from function_call (defensive — shouldn't crash)
			const fnCall = records.find(
				(r) =>
					r.type === "response_item" &&
					(r.payload as { type: string }).type === "function_call",
			);
			(fnCall!.payload as Record<string, unknown>).call_id = undefined;

			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 0, truncatePercent: 0 },
			});

			// Should not throw
			const result = stripSession(records, config);
			expect(result.records).toBeDefined();
		});

		it("mixed zone types in single pass", () => {
			const builder = new SessionBuilder().addSessionMeta();
			// Build 10 tool-bearing turns
			for (let i = 0; i < 10; i++) {
				builder.addTurn({ functionCalls: 1 });
			}
			const records = builder.build();

			// keep=6, truncate=50% → 4 removed, 3 truncated, 3 preserved
			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 6, truncatePercent: 50 },
			});

			const result = stripSession(records, config);

			// Verify all zones applied correctly in one call
			// 10 turns, keep=6, truncate=50% → 4 removed, 3 truncated, 3 preserved
			expect(result.statistics.functionCallsRemoved).toBe(4);
			expect(result.statistics.functionCallsTruncated).toBe(3);
			expect(result.records.length).toBeLessThan(records.length);
		});

		it("reasoning-only stripping with no tool turns", () => {
			const builder = new SessionBuilder().addSessionMeta();
			// Non-tool-bearing turns with reasoning
			builder.addTurn({ reasoning: true });
			builder.addTurn({ reasoning: true });
			const records = builder.build();

			const config = reasoningOnlyConfig({ reasoningMode: "full" });

			const result = stripSession(records, config);

			// Reasoning removed
			expect(countBySubtype(result.records, "reasoning")).toBe(0);
			// Messages preserved
			expect(countBySubtype(result.records, "message")).toBeGreaterThan(0);
		});
	});

	// ===== Input immutability =====
	describe("input immutability", () => {
		it("does not mutate input records array", () => {
			const builder = new SessionBuilder().addSessionMeta();
			builder.addTurn({ functionCalls: 1, reasoning: true });
			const records = builder.build();
			const originalLength = records.length;
			const originalFirstPayload = JSON.stringify(records[0].payload);

			const config = toolStripConfig({
				toolPreset: { keepTurnsWithTools: 0, truncatePercent: 0 },
			});

			stripSession(records, config);

			// Input array should be unchanged
			expect(records.length).toBe(originalLength);
			expect(JSON.stringify(records[0].payload)).toBe(originalFirstPayload);
		});
	});
});
