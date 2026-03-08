import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import consola from "consola";
import { join } from "pathe";
import { MalformedJsonError } from "../../src/errors/clone-operation-errors.js";
import {
	computeSessionStatistics,
	parseSessionFile,
	readSessionMetadata,
} from "../../src/io/session-file-reader.js";
import type {
	FunctionCallPayload,
	ReasoningPayload,
	RolloutLine,
} from "../../src/types/codex-session-types.js";
import { SessionBuilder } from "../fixtures/builders/session-builder.js";

/** Helper to write an array of RolloutLine objects as JSONL to a temp file. */
async function writeSessionFile(
	dir: string,
	filename: string,
	lines: (RolloutLine | string)[],
): Promise<string> {
	const filePath = join(dir, filename);
	const content = lines
		.map((line) => (typeof line === "string" ? line : JSON.stringify(line)))
		.join("\n");
	await writeFile(filePath, content);
	return filePath;
}

describe("session-file-reader", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "cxs-reader-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("TC-1.2.2: extracts metadata fields from session_meta record", async () => {
		const filePath = await writeSessionFile(tmpDir, "session.jsonl", [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: "test-thread-id",
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/home/user/project",
					originator: "user",
					cli_version: "1.2.3",
					source: "cli",
					model_provider: "openai",
					git: {
						commit_hash: "abc123",
						branch: "main",
						origin_url: "https://github.com/user/repo.git",
					},
				},
			} satisfies RolloutLine,
		]);

		const metadata = await readSessionMetadata(filePath);

		expect(metadata.cwd).toBe("/home/user/project");
		expect(metadata.cliVersion).toBe("1.2.3");
		expect(metadata.modelProvider).toBe("openai");
		expect(metadata.git).toBeDefined();
		expect(metadata.git?.branch).toBe("main");
		expect(metadata.git?.commit_hash).toBe("abc123");
		expect(metadata.git?.origin_url).toBe("https://github.com/user/repo.git");
	});

	it("TC-1.3.1: extracts first user message from response_item truncated to 80 chars", async () => {
		const longMessage =
			"A".repeat(100) +
			" this is extra text that should be truncated because it exceeds the limit";
		const filePath = await writeSessionFile(tmpDir, "session.jsonl", [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: "test-id",
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp",
					originator: "test",
					cli_version: "1.0.0",
					source: "test",
				},
			} satisfies RolloutLine,
			{
				timestamp: "2026-02-28T14:30:01.000Z",
				type: "turn_context",
				payload: {
					cwd: "/tmp",
					model: "o4-mini",
					approval_policy: { mode: "auto" },
					sandbox_policy: { mode: "off" },
					summary: null,
				},
			} satisfies RolloutLine,
			{
				timestamp: "2026-02-28T14:30:02.000Z",
				type: "response_item",
				payload: {
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: longMessage }],
				},
			} satisfies RolloutLine,
		]);

		const metadata = await readSessionMetadata(filePath);

		expect(metadata.firstUserMessage).toBeDefined();
		// Must be exactly 80 chars (77 + "...") since input exceeds 80
		expect(metadata.firstUserMessage!.length).toBe(80);
		// Must end with ellipsis to indicate truncation
		expect(metadata.firstUserMessage!.endsWith("...")).toBe(true);
		// Must start with the correct prefix (first 77 chars of input)
		expect(metadata.firstUserMessage!.startsWith("A".repeat(77))).toBe(true);
	});

	it("TC-1.3.2: falls back to event_msg for first user message when no user response_item", async () => {
		const eventMessage = "What is this project about?";
		const filePath = await writeSessionFile(tmpDir, "session.jsonl", [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: "test-id",
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp",
					originator: "test",
					cli_version: "1.0.0",
					source: "test",
				},
			} satisfies RolloutLine,
			{
				timestamp: "2026-02-28T14:30:01.000Z",
				type: "turn_context",
				payload: {
					cwd: "/tmp",
					model: "o4-mini",
					approval_policy: { mode: "auto" },
					sandbox_policy: { mode: "off" },
					summary: null,
				},
			} satisfies RolloutLine,
			{
				timestamp: "2026-02-28T14:30:02.000Z",
				type: "event_msg",
				payload: {
					type: "user_message",
					message: eventMessage,
				},
			} satisfies RolloutLine,
			{
				timestamp: "2026-02-28T14:30:03.000Z",
				type: "response_item",
				payload: {
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "This is a response" }],
					end_turn: true,
				},
			} satisfies RolloutLine,
		]);

		const metadata = await readSessionMetadata(filePath);

		expect(metadata.firstUserMessage).toBe(eventMessage);
	});

	it("skips bootstrap AGENTS/environment prompts when selecting first user message", async () => {
		const filePath = await writeSessionFile(tmpDir, "bootstrap-session.jsonl", [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: "test-id",
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp",
					originator: "test",
					cli_version: "1.0.0",
					source: "test",
				},
			} satisfies RolloutLine,
			{
				timestamp: "2026-02-28T14:30:01.000Z",
				type: "response_item",
				payload: {
					type: "message",
					role: "user",
					content: [
						{
							type: "input_text",
							text: "# AGENTS.md instructions for /tmp/project\n\n<INSTRUCTIONS>\n...\n</INSTRUCTIONS>\n<environment_context>\n...\n</environment_context>",
						},
					],
				},
			} satisfies RolloutLine,
			{
				timestamp: "2026-02-28T14:30:02.000Z",
				type: "event_msg",
				payload: {
					type: "user_message",
					message: "Build a bounded CLI in this directory.",
				},
			} satisfies RolloutLine,
		]);

		const metadata = await readSessionMetadata(filePath);

		expect(metadata.firstUserMessage).toBe(
			"Build a bounded CLI in this directory.",
		);
	});

	it("TC-3.3.1: skips malformed JSON with warning in non-strict mode", async () => {
		const filePath = await writeSessionFile(tmpDir, "session.jsonl", [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: "test-id",
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp/project",
					originator: "test",
					cli_version: "1.0.0",
					source: "test",
				},
			} satisfies RolloutLine,
			"{this is not valid json at all", // malformed line
			{
				timestamp: "2026-02-28T14:30:02.000Z",
				type: "response_item",
				payload: {
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: "Valid message" }],
				},
			} satisfies RolloutLine,
		]);

		const warnings: string[] = [];
		const originalWarn = consola.warn;
		(consola as { warn: (...args: unknown[]) => void }).warn = (
			...args: unknown[]
		) => {
			warnings.push(args.map((arg) => String(arg)).join(" "));
		};

		// Should not throw — malformed line is skipped
		const metadata = await readSessionMetadata(filePath);

		(consola as { warn: (...args: unknown[]) => void }).warn = originalWarn;

		// Should still extract valid data
		expect(metadata.cwd).toBe("/tmp/project");
		expect(metadata.firstUserMessage).toBe("Valid message");
		expect(
			warnings.some((warning) => warning.includes("Skipping malformed JSON")),
		).toBe(true);
	});

	it("handles empty files gracefully", async () => {
		const filePath = join(tmpDir, "empty.jsonl");
		await writeFile(filePath, "");

		// Empty file has no session_meta — should throw an error
		await expect(readSessionMetadata(filePath)).rejects.toThrow();
	});
});

// ─── Story 2: parseSessionFile + computeSessionStatistics ──────

/** Helper: build a session, write to temp file, return path. */
async function writeBuilderSession(
	dir: string,
	filename: string,
	records: RolloutLine[],
): Promise<string> {
	const filePath = join(dir, filename);
	const content = records.map((r) => JSON.stringify(r)).join("\n");
	await writeFile(filePath, content);
	return filePath;
}

describe("parseSessionFile", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "cxs-parser-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("TC-2.1.1: counts function_call records", async () => {
		const builder = new SessionBuilder().addSessionMeta();
		for (let i = 0; i < 5; i++) {
			builder.addTurn({ functionCalls: 2 });
		}
		const filePath = await writeBuilderSession(
			tmpDir,
			"fn-calls.jsonl",
			builder.build(),
		);

		const parsed = await parseSessionFile(filePath);
		const stats = computeSessionStatistics(parsed);

		expect(stats.functionCalls).toBe(10);
	});

	it("TC-2.1.2: counts reasoning records", async () => {
		const builder = new SessionBuilder().addSessionMeta();
		for (let i = 0; i < 3; i++) {
			builder.addTurn({ reasoning: true });
		}
		const filePath = await writeBuilderSession(
			tmpDir,
			"reasoning.jsonl",
			builder.build(),
		);

		const parsed = await parseSessionFile(filePath);
		const stats = computeSessionStatistics(parsed);

		expect(stats.reasoningBlocks).toBe(3);
	});

	it("TC-2.1.3: counts event_msg records", async () => {
		const builder = new SessionBuilder().addSessionMeta();
		// 50 event_msg records across multiple turns
		for (let i = 0; i < 10; i++) {
			builder.addTurn({
				events: [
					"user_message",
					"token_count",
					"agent_reasoning",
					"exec_command_begin",
					"exec_command_end",
				],
			});
		}
		const filePath = await writeBuilderSession(
			tmpDir,
			"events.jsonl",
			builder.build(),
		);

		const parsed = await parseSessionFile(filePath);
		const stats = computeSessionStatistics(parsed);

		expect(stats.eventMessages).toBe(50);
	});

	it("TC-2.2.1: reports compacted record positions", async () => {
		const builder = new SessionBuilder()
			.addSessionMeta()
			.addTurn()
			.addCompactedRecord()
			.addTurn()
			.addTurn()
			.addCompactedRecord()
			.addTurn();
		const filePath = await writeBuilderSession(
			tmpDir,
			"compacted.jsonl",
			builder.build(),
		);

		const parsed = await parseSessionFile(filePath);
		const stats = computeSessionStatistics(parsed);

		expect(stats.compactedRecords).toBe(2);
		// Builder produces: session_meta(1), turn_context(2), user_msg(3), asst_msg(4),
		// compacted(5), turn_context(6), user_msg(7), asst_msg(8), turn_context(9),
		// user_msg(10), asst_msg(11), compacted(12), turn_context(13), user_msg(14), asst_msg(15)
		expect(stats.compactedPositions).toEqual([5, 12]);
	});

	it("TC-2.2.2: reports no compaction", async () => {
		const builder = new SessionBuilder().addSessionMeta().addTurn().addTurn();
		const filePath = await writeBuilderSession(
			tmpDir,
			"no-compaction.jsonl",
			builder.build(),
		);

		const parsed = await parseSessionFile(filePath);
		const stats = computeSessionStatistics(parsed);

		expect(stats.compactedRecords).toBe(0);
		expect(stats.compactedPositions).toEqual([]);
	});

	it("TC-2.3.1: counts turns from turn_context records", async () => {
		const builder = new SessionBuilder().addSessionMeta();
		for (let i = 0; i < 5; i++) {
			builder.addTurn();
		}
		const filePath = await writeBuilderSession(
			tmpDir,
			"turns.jsonl",
			builder.build(),
		);

		const parsed = await parseSessionFile(filePath);
		const stats = computeSessionStatistics(parsed);

		expect(stats.turns).toBe(5);
	});

	it("TC-2.4.1: reports file size and token estimate", async () => {
		// Build a session, then pad content to reach ~100KB
		const builder = new SessionBuilder().addSessionMeta();
		// Add enough content to get close to 100KB
		for (let i = 0; i < 20; i++) {
			builder.addTurn({ functionCalls: 2 });
		}
		const records = builder.build();
		// Pad the last message to push total close to 100,000 bytes
		const baseContent = records.map((r) => JSON.stringify(r)).join("\n");
		const targetSize = 100_000;
		const paddingNeeded = targetSize - baseContent.length;

		let content: string;
		if (paddingNeeded > 0) {
			// Add a padded record to reach target size
			const paddedRecord: RolloutLine = {
				timestamp: "2025-01-15T10:59:59.000Z",
				type: "event_msg",
				payload: { type: "padding", data: "X".repeat(paddingNeeded - 120) },
			};
			content = `${baseContent}\n${JSON.stringify(paddedRecord)}`;
		} else {
			content = baseContent;
		}

		const filePath = join(tmpDir, "large-session.jsonl");
		await writeFile(filePath, content);

		const fileStats = await stat(filePath);
		const fileSizeBytes = fileStats.size;

		const parsed = await parseSessionFile(filePath);
		const stats = computeSessionStatistics(parsed);

		// Verify file size is reported correctly
		expect(stats.fileSizeBytes).toBe(fileSizeBytes);
		// Token estimate: fileSizeBytes / 4
		expect(stats.estimatedTokens).toBe(Math.floor(fileSizeBytes / 4));
	});

	it("TC-3.1.1: parses session_meta with accessible fields", async () => {
		const filePath = await writeSessionFile(tmpDir, "meta.jsonl", [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: "test-thread-123",
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/home/user/project",
					originator: "user",
					cli_version: "2.1.0",
					source: "cli",
					model_provider: "openai",
				},
			} satisfies RolloutLine,
		]);

		const parsed = await parseSessionFile(filePath);

		expect(parsed.metadata.id).toBe("test-thread-123");
		expect(parsed.metadata.cwd).toBe("/home/user/project");
		expect(parsed.metadata.cli_version).toBe("2.1.0");
	});

	it("TC-3.1.2: parses function_call response_item with accessible fields", async () => {
		const filePath = await writeSessionFile(tmpDir, "fn-call.jsonl", [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: "test-id",
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp",
					originator: "test",
					cli_version: "1.0.0",
					source: "test",
				},
			} satisfies RolloutLine,
			{
				timestamp: "2026-02-28T14:30:01.000Z",
				type: "response_item",
				payload: {
					type: "function_call",
					name: "read_file",
					arguments: '{"path":"/tmp/foo.ts"}',
					call_id: "call_abc123",
				},
			} satisfies RolloutLine,
		]);

		const parsed = await parseSessionFile(filePath);
		const fnCall = parsed.records.find(
			(r) =>
				r.type === "response_item" &&
				(r.payload as FunctionCallPayload).type === "function_call",
		);

		expect(fnCall).toBeDefined();
		const payload = fnCall!.payload as FunctionCallPayload;
		expect(payload.name).toBe("read_file");
		expect(payload.arguments).toBe('{"path":"/tmp/foo.ts"}');
		expect(payload.call_id).toBe("call_abc123");
	});

	it("TC-3.1.3: parses reasoning response_item with accessible fields", async () => {
		const filePath = await writeSessionFile(tmpDir, "reasoning.jsonl", [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: "test-id",
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp",
					originator: "test",
					cli_version: "1.0.0",
					source: "test",
				},
			} satisfies RolloutLine,
			{
				timestamp: "2026-02-28T14:30:01.000Z",
				type: "response_item",
				payload: {
					type: "reasoning",
					summary: [{ type: "summary_text", text: "Thinking..." }],
					encrypted_content: "enc_base64data",
				},
			} satisfies RolloutLine,
		]);

		const parsed = await parseSessionFile(filePath);
		const reasoning = parsed.records.find(
			(r) =>
				r.type === "response_item" &&
				(r.payload as ReasoningPayload).type === "reasoning",
		);

		expect(reasoning).toBeDefined();
		const payload = reasoning!.payload as ReasoningPayload;
		expect(payload.summary).toHaveLength(1);
		expect(payload.summary[0].text).toBe("Thinking...");
		expect(payload.encrypted_content).toBe("enc_base64data");
	});

	it("TC-3.1.4: preserves unknown record types with debug log", async () => {
		const filePath = await writeSessionFile(tmpDir, "unknown.jsonl", [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: "test-id",
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp",
					originator: "test",
					cli_version: "1.0.0",
					source: "test",
				},
			} satisfies RolloutLine,
			// Unknown top-level type
			'{"timestamp":"2026-02-28T14:30:01.000Z","type":"future_type","payload":{"data":"test"}}',
			// Unknown response_item subtype
			'{"timestamp":"2026-02-28T14:30:02.000Z","type":"response_item","payload":{"type":"future_subtype","content":"test"}}',
		]);

		const debugMessages: string[] = [];
		const originalDebug = consola.debug;
		(consola as { debug: (...args: unknown[]) => void }).debug = (
			...args: unknown[]
		) => {
			debugMessages.push(args.map((arg) => String(arg)).join(" "));
		};

		const parsed = await parseSessionFile(filePath);

		(consola as { debug: (...args: unknown[]) => void }).debug = originalDebug;

		// Both unknown records should be preserved
		expect(parsed.records).toHaveLength(3);
		// Unknown top-level type preserved as-is
		const unknownTopLevel = parsed.records[1];
		expect(unknownTopLevel.type as string).toBe("future_type");
		// Unknown response_item subtype preserved as-is
		const unknownSubtype = parsed.records[2];
		expect(unknownSubtype.type).toBe("response_item");
		expect((unknownSubtype.payload as { type: string }).type).toBe(
			"future_subtype",
		);
		expect(
			debugMessages.some((message) =>
				message.includes('Unknown record type "future_type"'),
			),
		).toBe(true);
		expect(
			debugMessages.some((message) =>
				message.includes('Unknown response_item subtype "future_subtype"'),
			),
		).toBe(true);
	});

	it("TC-3.2.1: discriminates all response_item subtypes", async () => {
		const subtypes: RolloutLine[] = [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: "test-id",
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp",
					originator: "test",
					cli_version: "1.0.0",
					source: "test",
				},
			},
			{
				timestamp: "2026-02-28T14:30:01.000Z",
				type: "response_item",
				payload: {
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: "Hello" }],
				},
			},
			{
				timestamp: "2026-02-28T14:30:02.000Z",
				type: "response_item",
				payload: {
					type: "function_call",
					name: "read",
					arguments: "{}",
					call_id: "c1",
				},
			},
			{
				timestamp: "2026-02-28T14:30:03.000Z",
				type: "response_item",
				payload: {
					type: "function_call_output",
					call_id: "c1",
					output: "result",
				},
			},
			{
				timestamp: "2026-02-28T14:30:04.000Z",
				type: "response_item",
				payload: {
					type: "reasoning",
					summary: [{ type: "summary_text", text: "thinking" }],
				},
			},
			{
				timestamp: "2026-02-28T14:30:05.000Z",
				type: "response_item",
				payload: {
					type: "local_shell_call",
					action: { command: ["ls"] },
					status: "completed",
				},
			},
			{
				timestamp: "2026-02-28T14:30:06.000Z",
				type: "response_item",
				payload: {
					type: "custom_tool_call",
					call_id: "c2",
					name: "my_tool",
					input: "{}",
				},
			},
			{
				timestamp: "2026-02-28T14:30:07.000Z",
				type: "response_item",
				payload: {
					type: "custom_tool_call_output",
					call_id: "c2",
					output: "custom result",
				},
			},
			{
				timestamp: "2026-02-28T14:30:08.000Z",
				type: "response_item",
				payload: { type: "web_search_call", action: { query: "test" } },
			},
			{
				timestamp: "2026-02-28T14:30:09.000Z",
				type: "response_item",
				payload: { type: "ghost_snapshot", ghost_commit: { sha: "abc" } },
			},
			{
				timestamp: "2026-02-28T14:30:10.000Z",
				type: "response_item",
				payload: { type: "compaction", encrypted_content: "enc_data" },
			},
		];

		const filePath = await writeBuilderSession(
			tmpDir,
			"all-subtypes.jsonl",
			subtypes,
		);

		const parsed = await parseSessionFile(filePath);

		// Extract all response_item payloads
		const responseItems = parsed.records
			.filter((r) => r.type === "response_item")
			.map((r) => (r.payload as { type: string }).type);

		expect(responseItems).toContain("message");
		expect(responseItems).toContain("function_call");
		expect(responseItems).toContain("function_call_output");
		expect(responseItems).toContain("reasoning");
		expect(responseItems).toContain("local_shell_call");
		expect(responseItems).toContain("custom_tool_call");
		expect(responseItems).toContain("custom_tool_call_output");
		expect(responseItems).toContain("web_search_call");
		expect(responseItems).toContain("ghost_snapshot");
		expect(responseItems).toContain("compaction");
		expect(responseItems).toHaveLength(10);
	});

	it("TC-3.3.2: aborts on malformed JSON in strict mode", async () => {
		const filePath = await writeSessionFile(tmpDir, "malformed-strict.jsonl", [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: "test-id",
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp",
					originator: "test",
					cli_version: "1.0.0",
					source: "test",
				},
			} satisfies RolloutLine,
			"{not valid json",
			{
				timestamp: "2026-02-28T14:30:02.000Z",
				type: "response_item",
				payload: {
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: "Hello" }],
				},
			} satisfies RolloutLine,
		]);

		await expect(parseSessionFile(filePath, { strict: true })).rejects.toThrow(
			MalformedJsonError,
		);

		try {
			await parseSessionFile(filePath, { strict: true });
		} catch (error) {
			expect(error).toBeInstanceOf(MalformedJsonError);
			const mjError = error as MalformedJsonError;
			// Line 2 is malformed (1-indexed)
			expect(mjError.lineNumber).toBe(2);
			expect(mjError.filePath).toBe(filePath);
		}
	});

	it("TC-3.3.3: skips malformed JSON in non-strict mode", async () => {
		const filePath = await writeSessionFile(tmpDir, "malformed-skip.jsonl", [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: "test-id",
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp",
					originator: "test",
					cli_version: "1.0.0",
					source: "test",
				},
			} satisfies RolloutLine,
			"this is broken json{{{",
			{
				timestamp: "2026-02-28T14:30:02.000Z",
				type: "response_item",
				payload: {
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: "After malformed" }],
				},
			} satisfies RolloutLine,
		]);

		const warnings: string[] = [];
		const originalWarn = consola.warn;
		(consola as { warn: (...args: unknown[]) => void }).warn = (
			...args: unknown[]
		) => {
			warnings.push(args.map((arg) => String(arg)).join(" "));
		};

		// Non-strict (default) should not throw
		const parsed = await parseSessionFile(filePath);

		(consola as { warn: (...args: unknown[]) => void }).warn = originalWarn;

		// Malformed line should be skipped — only 2 valid records
		expect(parsed.records).toHaveLength(2);
		expect(parsed.records[0].type).toBe("session_meta");
		expect(parsed.records[1].type).toBe("response_item");
		expect(
			warnings.some((warning) => warning.includes("Skipping malformed JSON")),
		).toBe(true);
	});

	it("skips structurally invalid record envelopes in non-strict mode", async () => {
		const filePath = await writeSessionFile(tmpDir, "invalid-envelope.jsonl", [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: "test-id",
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp",
					originator: "test",
					cli_version: "1.0.0",
					source: "test",
				},
			} satisfies RolloutLine,
			'{"foo":"bar"}',
			{
				timestamp: "2026-02-28T14:30:02.000Z",
				type: "response_item",
				payload: {
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: "hello" }],
				},
			} satisfies RolloutLine,
		]);

		const parsed = await parseSessionFile(filePath);
		expect(parsed.records).toHaveLength(2);
	});

	it("throws MalformedJsonError for structurally invalid record envelopes in strict mode", async () => {
		const filePath = await writeSessionFile(
			tmpDir,
			"invalid-envelope-strict.jsonl",
			[
				{
					timestamp: "2026-02-28T14:30:00.000Z",
					type: "session_meta",
					payload: {
						id: "test-id",
						timestamp: "2026-02-28T14:30:00.000Z",
						cwd: "/tmp",
						originator: "test",
						cli_version: "1.0.0",
						source: "test",
					},
				} satisfies RolloutLine,
				'{"foo":"bar"}',
			],
		);

		await expect(parseSessionFile(filePath, { strict: true })).rejects.toThrow(
			MalformedJsonError,
		);
	});

	it("non-TC: session with only session_meta reports zero turns and zero tool calls", async () => {
		const filePath = await writeSessionFile(tmpDir, "meta-only.jsonl", [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: "test-id",
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp",
					originator: "test",
					cli_version: "1.0.0",
					source: "test",
				},
			} satisfies RolloutLine,
		]);

		const parsed = await parseSessionFile(filePath);
		const stats = computeSessionStatistics(parsed);

		expect(stats.turns).toBe(0);
		expect(stats.functionCalls).toBe(0);
		expect(stats.reasoningBlocks).toBe(0);
		expect(stats.eventMessages).toBe(0);
		expect(stats.compactedRecords).toBe(0);
	});

	it("non-TC: very large file parses without error", async () => {
		const builder = new SessionBuilder().addSessionMeta();
		// Generate 100 turns with tool calls — produces a large record set
		for (let i = 0; i < 100; i++) {
			builder.addTurn({
				functionCalls: 2,
				reasoning: true,
				events: ["user_message", "token_count"],
			});
		}
		const filePath = await writeBuilderSession(
			tmpDir,
			"large.jsonl",
			builder.build(),
		);

		const parsed = await parseSessionFile(filePath);
		const stats = computeSessionStatistics(parsed);

		expect(stats.turns).toBe(100);
		expect(stats.functionCalls).toBe(200);
		expect(stats.reasoningBlocks).toBe(100);
		expect(parsed.records.length).toBeGreaterThan(0);
	});
});
