import type {
	CompactedPayload,
	CustomToolCallOutputPayload,
	CustomToolCallPayload,
	EventMsgPayload,
	FunctionCallOutputPayload,
	FunctionCallPayload,
	LocalShellCallPayload,
	MessagePayload,
	ReasoningPayload,
	RolloutLine,
	SessionMetaPayload,
	TurnContextPayload,
	WebSearchCallPayload,
} from "../../../src/types/codex-session-types.js";

interface TurnOptions {
	functionCalls?: number;
	localShellCalls?: number;
	customToolCalls?: number;
	webSearchCalls?: number;
	reasoning?: boolean;
	events?: string[];
}

function isoTimestamp(offset: number): string {
	return new Date(
		Date.UTC(2025, 0, 15, 10, 0, 0) + offset * 1000,
	).toISOString();
}

export class SessionBuilder {
	private records: RolloutLine[] = [];
	private timestampOffset = 0;
	private turnCount = 0;
	private callIdCounter = 0;

	addSessionMeta(overrides?: Partial<SessionMetaPayload>): this {
		const payload: SessionMetaPayload = {
			id: "sess_test_0001",
			timestamp: isoTimestamp(this.timestampOffset),
			cwd: "/tmp/test-project",
			originator: "test",
			cli_version: "1.0.0",
			source: "test-builder",
			...overrides,
		};
		this.records.push({
			timestamp: isoTimestamp(this.timestampOffset),
			type: "session_meta",
			payload,
		});
		this.timestampOffset++;
		return this;
	}

	addTurn(options?: TurnOptions): this {
		const opts: Required<TurnOptions> = {
			functionCalls: options?.functionCalls ?? 0,
			localShellCalls: options?.localShellCalls ?? 0,
			customToolCalls: options?.customToolCalls ?? 0,
			webSearchCalls: options?.webSearchCalls ?? 0,
			reasoning: options?.reasoning ?? false,
			events: options?.events ?? [],
		};

		// Turn context record at start of each turn
		const turnContext: TurnContextPayload = {
			turn_id: `turn_${this.turnCount}`,
			cwd: "/tmp/test-project",
			model: "o4-mini",
			approval_policy: { mode: "auto" },
			sandbox_policy: { mode: "off" },
			summary: null,
		};
		this.records.push({
			timestamp: isoTimestamp(this.timestampOffset),
			type: "turn_context",
			payload: turnContext,
		});
		this.timestampOffset++;

		// User message
		const userMsg: MessagePayload = {
			type: "message",
			role: "user",
			content: [
				{ type: "input_text", text: `User message for turn ${this.turnCount}` },
			],
		};
		this.records.push({
			timestamp: isoTimestamp(this.timestampOffset),
			type: "response_item",
			payload: userMsg,
		});
		this.timestampOffset++;

		// Events
		for (const eventType of opts.events) {
			const eventPayload: EventMsgPayload = {
				type: eventType,
			};
			this.records.push({
				timestamp: isoTimestamp(this.timestampOffset),
				type: "event_msg",
				payload: eventPayload,
			});
			this.timestampOffset++;
		}

		// Reasoning
		if (opts.reasoning) {
			const reasoning: ReasoningPayload = {
				type: "reasoning",
				summary: [{ type: "summary_text", text: "Thinking about the task..." }],
				content: [{ type: "text", text: "Internal reasoning content" }],
			};
			this.records.push({
				timestamp: isoTimestamp(this.timestampOffset),
				type: "response_item",
				payload: reasoning,
			});
			this.timestampOffset++;
		}

		// Function calls (paired: function_call + function_call_output)
		for (let i = 0; i < opts.functionCalls; i++) {
			const callId = this.nextCallId();
			const fnCall: FunctionCallPayload = {
				type: "function_call",
				name: `tool_${i}`,
				arguments: JSON.stringify({ path: `/tmp/file_${i}.ts` }),
				call_id: callId,
			};
			this.records.push({
				timestamp: isoTimestamp(this.timestampOffset),
				type: "response_item",
				payload: fnCall,
			});
			this.timestampOffset++;

			const fnOutput: FunctionCallOutputPayload = {
				type: "function_call_output",
				call_id: callId,
				output: `Output for tool_${i}`,
			};
			this.records.push({
				timestamp: isoTimestamp(this.timestampOffset),
				type: "response_item",
				payload: fnOutput,
			});
			this.timestampOffset++;
		}

		// Local shell calls (standalone)
		for (let i = 0; i < opts.localShellCalls; i++) {
			const shellCall: LocalShellCallPayload = {
				type: "local_shell_call",
				call_id: this.nextCallId(),
				action: { command: ["ls", "-la"] },
				status: "completed",
			};
			this.records.push({
				timestamp: isoTimestamp(this.timestampOffset),
				type: "response_item",
				payload: shellCall,
			});
			this.timestampOffset++;
		}

		// Custom tool calls (paired: custom_tool_call + custom_tool_call_output)
		for (let i = 0; i < opts.customToolCalls; i++) {
			const callId = this.nextCallId();
			const customCall: CustomToolCallPayload = {
				type: "custom_tool_call",
				call_id: callId,
				name: `custom_tool_${i}`,
				input: JSON.stringify({ query: `test query ${i}` }),
			};
			this.records.push({
				timestamp: isoTimestamp(this.timestampOffset),
				type: "response_item",
				payload: customCall,
			});
			this.timestampOffset++;

			const customOutput: CustomToolCallOutputPayload = {
				type: "custom_tool_call_output",
				call_id: callId,
				output: `Custom output for tool_${i}`,
			};
			this.records.push({
				timestamp: isoTimestamp(this.timestampOffset),
				type: "response_item",
				payload: customOutput,
			});
			this.timestampOffset++;
		}

		// Web search calls (standalone)
		for (let i = 0; i < opts.webSearchCalls; i++) {
			const webSearch: WebSearchCallPayload = {
				type: "web_search_call",
				action: { query: `search query ${i}` },
				status: "completed",
			};
			this.records.push({
				timestamp: isoTimestamp(this.timestampOffset),
				type: "response_item",
				payload: webSearch,
			});
			this.timestampOffset++;
		}

		// Assistant response message
		const assistantMsg: MessagePayload = {
			type: "message",
			role: "assistant",
			content: [
				{
					type: "output_text",
					text: `Assistant response for turn ${this.turnCount}`,
				},
			],
			end_turn: true,
		};
		this.records.push({
			timestamp: isoTimestamp(this.timestampOffset),
			type: "response_item",
			payload: assistantMsg,
		});
		this.timestampOffset++;

		this.turnCount++;
		return this;
	}

	addCompactedRecord(): this {
		const payload: CompactedPayload = {
			message: "Context compacted to save tokens",
		};
		this.records.push({
			timestamp: isoTimestamp(this.timestampOffset),
			type: "compacted",
			payload,
		});
		this.timestampOffset++;
		return this;
	}

	build(): RolloutLine[] {
		return [...this.records];
	}

	private nextCallId(): string {
		this.callIdCounter++;
		return `call_${this.callIdCounter.toString().padStart(4, "0")}`;
	}
}
