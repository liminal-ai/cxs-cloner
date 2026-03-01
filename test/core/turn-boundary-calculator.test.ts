import { describe, expect, it } from "bun:test";
import { identifyTurns } from "../../src/core/turn-boundary-calculator.js";
import type {
	MessagePayload,
	RolloutLine,
} from "../../src/types/codex-session-types.js";
import { SessionBuilder } from "../fixtures/builders/session-builder.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a raw response_item record for inline insertion. */
function responseItem(
	payload: { type: string } & Record<string, unknown>,
	offset = 0,
): RolloutLine {
	return {
		timestamp: new Date(
			Date.UTC(2025, 0, 15, 10, 0, 0) + offset * 1000,
		).toISOString(),
		type: "response_item",
		payload: payload as RolloutLine["payload"],
	};
}

describe("identifyTurns", () => {
	// ── AC-4.1: Turn boundary identification ─────────────────────────────

	it("TC-4.1.1: identifies turns from turn_context positions", () => {
		// Build a session where turn_context records land at specific indices.
		// session_meta (0) + 4 response_items (1-4) = 5 records before first turn_context
		// Then 3 turns with varied content so turn_context lands at indices 5, 20, 40.
		//
		// Approach: build manually to control exact index positions.
		const builder = new SessionBuilder();
		builder.addSessionMeta();
		// Add 4 response_items to fill indices 1-4
		const records = builder.build();
		for (let i = 0; i < 4; i++) {
			records.push(
				responseItem(
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: `filler ${i}` }],
					} satisfies MessagePayload,
					i + 1,
				),
			);
		}
		// Index 5: first turn_context (turn 0)
		// We need turn_context at 5, 20, 40
		// Turn 0: indices 5..19 (15 records: 1 turn_context + 14 fillers)
		records.push({
			timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, 5)).toISOString(),
			type: "turn_context",
			payload: {
				turn_id: "turn_0",
				cwd: "/tmp",
				model: "o4-mini",
				approval_policy: {},
				sandbox_policy: {},
				summary: null,
			},
		});
		for (let i = 0; i < 14; i++) {
			records.push(
				responseItem(
					{
						type: "message",
						role: "assistant",
						content: [{ type: "output_text", text: `turn0 record ${i}` }],
					} satisfies MessagePayload,
					100 + i,
				),
			);
		}
		// Index 20: second turn_context (turn 1)
		records.push({
			timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, 20)).toISOString(),
			type: "turn_context",
			payload: {
				turn_id: "turn_1",
				cwd: "/tmp",
				model: "o4-mini",
				approval_policy: {},
				sandbox_policy: {},
				summary: null,
			},
		});
		for (let i = 0; i < 19; i++) {
			records.push(
				responseItem(
					{
						type: "message",
						role: "assistant",
						content: [{ type: "output_text", text: `turn1 record ${i}` }],
					} satisfies MessagePayload,
					200 + i,
				),
			);
		}
		// Index 40: third turn_context (turn 2)
		records.push({
			timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, 40)).toISOString(),
			type: "turn_context",
			payload: {
				turn_id: "turn_2",
				cwd: "/tmp",
				model: "o4-mini",
				approval_policy: {},
				sandbox_policy: {},
				summary: null,
			},
		});
		// Add some trailing records
		for (let i = 0; i < 5; i++) {
			records.push(
				responseItem(
					{
						type: "message",
						role: "assistant",
						content: [{ type: "output_text", text: `turn2 record ${i}` }],
					} satisfies MessagePayload,
					300 + i,
				),
			);
		}

		expect(records[5].type).toBe("turn_context"); // sanity
		expect(records[20].type).toBe("turn_context"); // sanity
		expect(records[40].type).toBe("turn_context"); // sanity

		const result = identifyTurns(records);

		expect(result.turns).toHaveLength(3);
		expect(result.turns[0]).toMatchObject({
			startIndex: 5,
			endIndex: 20,
			turnIndex: 0,
		});
		expect(result.turns[1]).toMatchObject({
			startIndex: 20,
			endIndex: 40,
			turnIndex: 1,
		});
		expect(result.turns[2]).toMatchObject({
			startIndex: 40,
			endIndex: records.length,
			turnIndex: 2,
		});
		expect(result.preTurnRecords).toEqual({ startIndex: 0, endIndex: 5 });
	});

	it("TC-4.1.2: bounds turns by turn_context not event_msg", () => {
		// Build session with user_message event_msg between turn_context records
		const builder = new SessionBuilder();
		builder.addSessionMeta();
		builder.addTurn({ events: ["user_message"] });
		builder.addTurn({ events: ["user_message"] });
		const records = builder.build();

		const result = identifyTurns(records);

		// Turns should be bounded by turn_context, not by event_msg
		expect(result.turns).toHaveLength(2);
		// Each turn starts at a turn_context record
		for (const turn of result.turns) {
			expect(records[turn.startIndex].type).toBe("turn_context");
		}
	});

	// ── AC-4.2: Pre-turn records ─────────────────────────────────────────

	it("TC-4.2.1: preserves pre-turn records", () => {
		// session_meta + 2 response_items before any turn_context
		const builder = new SessionBuilder();
		builder.addSessionMeta();
		const records = builder.build();
		// Add some initial response_items (pre-turn)
		records.push(
			responseItem(
				{
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: "initial message" }],
				} satisfies MessagePayload,
				1,
			),
		);
		records.push(
			responseItem(
				{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "initial response" }],
				} satisfies MessagePayload,
				2,
			),
		);
		// Then a turn_context
		records.push({
			timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, 3)).toISOString(),
			type: "turn_context",
			payload: {
				turn_id: "turn_0",
				cwd: "/tmp",
				model: "o4-mini",
				approval_policy: {},
				sandbox_policy: {},
				summary: null,
			},
		});
		records.push(
			responseItem(
				{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "turn content" }],
				} satisfies MessagePayload,
				4,
			),
		);

		const result = identifyTurns(records);

		// Pre-turn records: session_meta (0) + 2 response_items (1, 2) = indices 0..3
		expect(result.preTurnRecords).toEqual({ startIndex: 0, endIndex: 3 });
		expect(result.turns).toHaveLength(1);
		expect(result.turns[0].startIndex).toBe(3);
	});

	// ── AC-4.3: Compaction handling ──────────────────────────────────────

	it("TC-4.3.1: identifies only post-compaction turns", () => {
		const records: RolloutLine[] = [];

		// session_meta at index 0
		const metaBuilder = new SessionBuilder();
		metaBuilder.addSessionMeta();
		records.push(...metaBuilder.build());

		// Fill indices 1-9 with filler response_items
		for (let i = 0; i < 9; i++) {
			records.push(
				responseItem(
					{
						type: "message",
						role: "assistant",
						content: [{ type: "output_text", text: `pre-compaction ${i}` }],
					} satisfies MessagePayload,
					i + 1,
				),
			);
		}

		// Index 10: compacted record
		records.push({
			timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, 10)).toISOString(),
			type: "compacted",
			payload: { message: "Context compacted" },
		});

		// 5 post-compaction turns
		for (let t = 0; t < 5; t++) {
			records.push({
				timestamp: new Date(
					Date.UTC(2025, 0, 15, 10, 0, 20 + t * 10),
				).toISOString(),
				type: "turn_context",
				payload: {
					turn_id: `turn_post_${t}`,
					cwd: "/tmp",
					model: "o4-mini",
					approval_policy: {},
					sandbox_policy: {},
					summary: null,
				},
			});
			records.push(
				responseItem(
					{
						type: "message",
						role: "assistant",
						content: [
							{ type: "output_text", text: `post-compaction turn ${t}` },
						],
					} satisfies MessagePayload,
					50 + t,
				),
			);
		}

		const result = identifyTurns(records);

		expect(result.turns).toHaveLength(5);
		expect(result.compactionDetected).toBe(true);
		expect(result.lastCompactionIndex).toBe(10);
		// Pre-turn includes everything up to first post-compaction turn_context
		expect(result.preTurnRecords.startIndex).toBe(0);
		expect(result.preTurnRecords.endIndex).toBe(11); // 0..10 inclusive = endIndex 11
	});

	it("TC-4.3.2: handles mid-turn compaction", () => {
		// turn_context_A → records → compacted → turn_context_B → records
		const records: RolloutLine[] = [];

		// session_meta at index 0
		records.push({
			timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, 0)).toISOString(),
			type: "session_meta",
			payload: {
				id: "sess_test_mid",
				timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, 0)).toISOString(),
				cwd: "/tmp",
				originator: "test",
				cli_version: "1.0.0",
				source: "test",
			},
		});

		// turn_context_A at index 1 (pre-compaction — should NOT define a turn)
		records.push({
			timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, 1)).toISOString(),
			type: "turn_context",
			payload: {
				turn_id: "turn_A",
				cwd: "/tmp",
				model: "o4-mini",
				approval_policy: {},
				sandbox_policy: {},
				summary: null,
			},
		});

		// Some content at index 2
		records.push(
			responseItem(
				{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "mid-turn content" }],
				} satisfies MessagePayload,
				2,
			),
		);

		// compacted at index 3
		records.push({
			timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, 3)).toISOString(),
			type: "compacted",
			payload: { message: "Compacted" },
		});

		// turn_context_B at index 4 (post-compaction — SHOULD define a turn)
		records.push({
			timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, 4)).toISOString(),
			type: "turn_context",
			payload: {
				turn_id: "turn_B",
				cwd: "/tmp",
				model: "o4-mini",
				approval_policy: {},
				sandbox_policy: {},
				summary: null,
			},
		});

		// Content after turn_context_B
		records.push(
			responseItem(
				{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "post-compaction content" }],
				} satisfies MessagePayload,
				5,
			),
		);

		const result = identifyTurns(records);

		// Only turn_context_B defines a turn
		expect(result.turns).toHaveLength(1);
		expect(result.turns[0].startIndex).toBe(4);
		expect(result.turns[0].endIndex).toBe(6);

		// Pre-turn includes everything before turn_context_B: indices 0..3
		expect(result.preTurnRecords).toEqual({ startIndex: 0, endIndex: 4 });

		expect(result.compactionDetected).toBe(true);
		expect(result.lastCompactionIndex).toBe(3);
	});

	// ── AC-4.4: Tool-bearing classification ──────────────────────────────

	it("TC-4.4.1: classifies turn with function_call as tool-bearing", () => {
		const builder = new SessionBuilder();
		builder.addSessionMeta();
		builder.addTurn({ functionCalls: 1 });
		const records = builder.build();

		const result = identifyTurns(records);

		expect(result.turns).toHaveLength(1);
		expect(result.turns[0].isToolBearing).toBe(true);
	});

	it("TC-4.4.2: classifies message-only turn as non-tool-bearing", () => {
		const builder = new SessionBuilder();
		builder.addSessionMeta();
		builder.addTurn({ reasoning: true }); // message + reasoning only
		const records = builder.build();

		const result = identifyTurns(records);

		expect(result.turns).toHaveLength(1);
		expect(result.turns[0].isToolBearing).toBe(false);
	});

	it("TC-4.4.3: classifies turn with other tool types as tool-bearing", () => {
		const builder = new SessionBuilder();
		builder.addSessionMeta();
		builder.addTurn({ localShellCalls: 1 });
		builder.addTurn({ customToolCalls: 1 });
		builder.addTurn({ webSearchCalls: 1 });
		const records = builder.build();

		const result = identifyTurns(records);

		expect(result.turns).toHaveLength(3);
		expect(result.turns[0].isToolBearing).toBe(true);
		expect(result.turns[1].isToolBearing).toBe(true);
		expect(result.turns[2].isToolBearing).toBe(true);
	});

	// ── Non-TC Decided Tests ─────────────────────────────────────────────

	it("returns empty turns array when session has zero turn_context records", () => {
		// session with only session_meta and some response_items — no turn_context
		const records: RolloutLine[] = [];
		records.push({
			timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, 0)).toISOString(),
			type: "session_meta",
			payload: {
				id: "sess_no_turns",
				timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, 0)).toISOString(),
				cwd: "/tmp",
				originator: "test",
				cli_version: "1.0.0",
				source: "test",
			},
		});
		records.push(
			responseItem(
				{
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: "hello" }],
				} satisfies MessagePayload,
				1,
			),
		);

		const result = identifyTurns(records);

		expect(result.turns).toHaveLength(0);
		expect(result.preTurnRecords).toEqual({
			startIndex: 0,
			endIndex: 2,
		});
		expect(result.compactionDetected).toBe(false);
		expect(result.lastCompactionIndex).toBeNull();
	});

	it("handles 100+ turns for performance sanity", () => {
		const builder = new SessionBuilder();
		builder.addSessionMeta();
		for (let i = 0; i < 120; i++) {
			builder.addTurn({ functionCalls: i % 3 === 0 ? 1 : 0 });
		}
		const records = builder.build();

		const result = identifyTurns(records);

		expect(result.turns).toHaveLength(120);
		// Verify tool-bearing classification — every 3rd turn has a function_call
		for (let i = 0; i < 120; i++) {
			expect(result.turns[i].isToolBearing).toBe(i % 3 === 0);
		}
	});

	it("handles consecutive turn_context records with no content between them", () => {
		const records: RolloutLine[] = [];
		records.push({
			timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, 0)).toISOString(),
			type: "session_meta",
			payload: {
				id: "sess_consecutive",
				timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, 0)).toISOString(),
				cwd: "/tmp",
				originator: "test",
				cli_version: "1.0.0",
				source: "test",
			},
		});

		// 3 consecutive turn_context records with nothing between them
		for (let i = 0; i < 3; i++) {
			records.push({
				timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, i + 1)).toISOString(),
				type: "turn_context",
				payload: {
					turn_id: `turn_${i}`,
					cwd: "/tmp",
					model: "o4-mini",
					approval_policy: {},
					sandbox_policy: {},
					summary: null,
				},
			});
		}

		const result = identifyTurns(records);

		expect(result.turns).toHaveLength(3);
		// First two turns have empty ranges (startIndex == endIndex - 1, only the turn_context itself)
		expect(result.turns[0]).toMatchObject({
			startIndex: 1,
			endIndex: 2,
			turnIndex: 0,
			isToolBearing: false,
		});
		expect(result.turns[1]).toMatchObject({
			startIndex: 2,
			endIndex: 3,
			turnIndex: 1,
			isToolBearing: false,
		});
		expect(result.turns[2]).toMatchObject({
			startIndex: 3,
			endIndex: 4,
			turnIndex: 2,
			isToolBearing: false,
		});
	});

	// ── Zone is always null ──────────────────────────────────────────────

	it("always sets zone to null on all turns", () => {
		const builder = new SessionBuilder();
		builder.addSessionMeta();
		builder.addTurn({ functionCalls: 1 });
		builder.addTurn();
		builder.addTurn({ localShellCalls: 1 });
		const records = builder.build();

		const result = identifyTurns(records);

		for (const turn of result.turns) {
			expect(turn.zone).toBeNull();
		}
	});
});
