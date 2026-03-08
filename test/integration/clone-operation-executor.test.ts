import { afterEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import consola from "consola";
import { join } from "pathe";
import { DEFAULT_TRUNCATE_LENGTH } from "../../src/config/tool-removal-presets.js";
import { executeCloneOperation } from "../../src/core/clone-operation-executor.js";
import { scanSessionDirectory } from "../../src/io/session-directory-scanner.js";
import { readSessionMetadata } from "../../src/io/session-file-reader.js";
import type { ResolvedCloneConfig } from "../../src/types/clone-operation-types.js";
import type {
	RolloutLine,
	SessionMetaPayload,
	TurnContextPayload,
} from "../../src/types/codex-session-types.js";
import { NATIVE_LIMITED_EVENT_PRESERVE_LIST } from "../../src/types/codex-session-types.js";
import { SessionBuilder } from "../fixtures/builders/session-builder.js";

let tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "cxs-executor-test-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	for (const dir of tempDirs) {
		try {
			await rm(dir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	}
	tempDirs = [];
});

/** Write a session to a properly named file in a temp codex dir structure. */
async function writeTestSession(
	codexDir: string,
	threadId: string,
	records: RolloutLine[],
): Promise<string> {
	const now = new Date();
	const year = now.getFullYear().toString();
	const month = (now.getMonth() + 1).toString().padStart(2, "0");
	const day = now.getDate().toString().padStart(2, "0");
	const hours = now.getHours().toString().padStart(2, "0");
	const minutes = now.getMinutes().toString().padStart(2, "0");
	const seconds = now.getSeconds().toString().padStart(2, "0");

	const dateDir = join(codexDir, "sessions", year, month, day);
	await mkdir(dateDir, { recursive: true });

	const timestamp = `${year}-${month}-${day}T${hours}-${minutes}-${seconds}`;
	const fileName = `rollout-${timestamp}-${threadId}.jsonl`;
	const filePath = join(dateDir, fileName);

	const content = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
	await writeFile(filePath, content, "utf-8");

	return filePath;
}

/** Build a standard config for tests. */
function buildConfig(
	codexDir: string,
	threadId: string,
	overrides?: Partial<ResolvedCloneConfig>,
): ResolvedCloneConfig {
	return {
		sessionId: threadId,
		codexDir,
		outputPath: null,
		targetCwd: null,
		stripConfig: {
			toolPreset: { keepTurnsWithTools: 20, truncatePercent: 50 },
			reasoningMode: "full",
			stripTools: true,
			eventPreserveList: NATIVE_LIMITED_EVENT_PRESERVE_LIST,
			truncateLength: DEFAULT_TRUNCATE_LENGTH,
		},
		force: false,
		jsonOutput: false,
		verbose: false,
		...overrides,
	};
}

/** Parse a JSONL output file into records. */
async function readOutputRecords(filePath: string): Promise<RolloutLine[]> {
	const content = await readFile(filePath, "utf-8");
	return content
		.split("\n")
		.filter((l) => l.trim() !== "")
		.map((l) => JSON.parse(l) as RolloutLine);
}

/** Find session_meta record in a record array. */
function findSessionMeta(
	records: RolloutLine[],
): SessionMetaPayload | undefined {
	for (const record of records) {
		if (record.type === "session_meta") {
			return record.payload as SessionMetaPayload;
		}
	}
	return undefined;
}

async function writeSessionIndexEntry(
	codexDir: string,
	threadId: string,
	threadName: string,
): Promise<void> {
	await writeFile(
		join(codexDir, "session_index.jsonl"),
		JSON.stringify({
			id: threadId,
			thread_name: threadName,
			updated_at: "2026-03-05T21:34:12.204811Z",
		}) + "\n",
		"utf-8",
	);
}

describe("executeCloneOperation", () => {
	// TC-8.1.1: clone gets new UUID
	test("TC-8.1.1: clone gets new UUID that differs from source", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-1111-2222-3333-444444444444";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 2 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		expect(result.clonedThreadId).not.toBe(sourceThreadId);
		expect(result.clonedThreadId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});

	// TC-8.1.2: session_meta has new thread ID
	test("TC-8.1.2: session_meta in output contains new thread ID", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-aaaa-bbbb-cccc-dddddddddddd";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);
		const meta = findSessionMeta(outputRecords);

		expect(meta).toBeDefined();
		expect(meta!.id).toBe(result.clonedThreadId);
	});

	// TC-8.3.2: custom path warns no resume
	test("TC-8.3.2: custom output path sets resumable to false", async () => {
		const codexDir = await createTempDir();
		const outputDir = await createTempDir();
		const sourceThreadId = "source-eeee-ffff-0000-111111111111";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const customOutput = join(outputDir, "custom-clone.jsonl");
		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId, { outputPath: customOutput }),
		);

		expect(result.resumable).toBe(false);
		expect(result.clonedSessionFilePath).toBe(customOutput);
	});

	// TC-8.3.3: every output line is valid JSON
	test("TC-8.3.3: every output line is valid JSON", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-2222-3333-4444-555555555555";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 3 })
			.addTurn({ functionCalls: 2, reasoning: true })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		const content = await readFile(result.clonedSessionFilePath, "utf-8");
		const lines = content.split("\n").filter((l) => l.trim() !== "");

		for (let i = 0; i < lines.length; i++) {
			expect(() => JSON.parse(lines[i])).not.toThrow();
		}
	});

	// TC-8.4.1: session_meta payload.id matches new UUID
	test("TC-8.4.1: session_meta payload.id matches clonedThreadId", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-6666-7777-8888-999999999999";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);
		const meta = findSessionMeta(outputRecords);

		expect(meta!.id).toBe(result.clonedThreadId);
	});

	// TC-8.4.2: session_meta preserves original cwd, git, model_provider
	test("TC-8.4.2: session_meta preserves original fields", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-preserve-test-000000000000";
		const records = new SessionBuilder()
			.addSessionMeta({
				id: sourceThreadId,
				cwd: "/home/user/my-project",
				model_provider: "openai",
				git: {
					commit_hash: "abc123def",
					branch: "feature/test",
					origin_url: "https://github.com/user/repo.git",
				},
			})
			.addTurn({ functionCalls: 1 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);
		const meta = findSessionMeta(outputRecords);

		expect(meta!.cwd).toBe("/home/user/my-project");
		expect(meta!.model_provider).toBe("openai");
		expect(meta!.git?.commit_hash).toBe("abc123def");
		expect(meta!.git?.branch).toBe("feature/test");
		expect(meta!.git?.origin_url).toBe("https://github.com/user/repo.git");
	});

	// TC-8.4.3: session_meta sets forked_from_id to source ID
	test("TC-8.4.3: session_meta sets forked_from_id", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-fork-test-000000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);
		const meta = findSessionMeta(outputRecords);

		expect(meta!.forked_from_id).toBe(sourceThreadId);
	});

	test("default-location clone keeps filename, session_meta, and session_index consistent", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-name-test-000000000000";
		const sourceThreadName = "Review compatibility flow";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1, events: ["user_message"] })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);
		await writeSessionIndexEntry(codexDir, sourceThreadId, sourceThreadName);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);
		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);
		const meta = findSessionMeta(outputRecords);
		const sessionIndex = await readFile(
			join(codexDir, "session_index.jsonl"),
			"utf-8",
		);
		const entries = sessionIndex
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as Record<string, string>);
		const cloneEntry = entries.at(-1);

		expect(result.sessionIndexUpdated).toBe(true);
		expect(result.cloneThreadName).toBe("Review compatibility flow (Clone)");
		expect(result.clonedSessionFilePath).toContain(result.clonedThreadId);
		expect(result.cloneTimestamp).toBeDefined();
		expect(meta!.id).toBe(result.clonedThreadId);
		expect(meta!.forked_from_id).toBe(sourceThreadId);
		expect(meta!.timestamp).toBe(result.cloneTimestamp);
		expect(outputRecords[0].timestamp).toBe(result.cloneTimestamp);
		expect(cloneEntry).toEqual({
			id: result.clonedThreadId,
			thread_name: "Review compatibility flow (Clone)",
			updated_at: result.cloneTimestamp,
		});
	});

	test("default-location clone is discoverable through filesystem listing without DB writes", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-discoverable-000000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1, events: ["user_message"] })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		const sessions = await scanSessionDirectory(codexDir);
		const clonedSession = sessions.find(
			(session) => session.threadId === result.clonedThreadId,
		);

		expect(clonedSession).toBeDefined();

		const metadata = await readSessionMetadata(clonedSession!.filePath);
		expect(metadata.threadId).toBe(result.clonedThreadId);
		expect(metadata.createdAt.toISOString()).toBe(result.cloneTimestamp);
		expect(metadata.firstUserMessage).toBe("User message for turn 0");
	});

	test("default-location clone prefers source session_index name and increments clone suffixes", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-reclone-name-000000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1, events: ["user_message"] })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);
		await writeSessionIndexEntry(
			codexDir,
			sourceThreadId,
			"Task review (Clone 2)",
		);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		expect(result.cloneThreadName).toBe("Task review (Clone 3)");
	});

	test("default-location clone ignores bootstrap prompts when deriving fallback clone names", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-bootstrap-name-00000000000";
		const records: RolloutLine[] = [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: sourceThreadId,
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp/project",
					originator: "test",
					cli_version: "1.0.0",
					source: "exec",
				},
			},
			{
				timestamp: "2026-02-28T14:30:01.000Z",
				type: "turn_context",
				payload: {
					cwd: "/tmp/project",
					model: "o4-mini",
					approval_policy: { mode: "auto" },
					sandbox_policy: { mode: "off" },
					summary: null,
				},
			},
			{
				timestamp: "2026-02-28T14:30:02.000Z",
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
			},
			{
				timestamp: "2026-02-28T14:30:03.000Z",
				type: "event_msg",
				payload: {
					type: "user_message",
					message: "Build a bounded CLI in this directory.",
				},
			},
			{
				timestamp: "2026-02-28T14:30:04.000Z",
				type: "event_msg",
				payload: {
					type: "agent_message",
					message: "Bounded CLI build started.",
				},
			},
		];

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		expect(result.cloneThreadName).toBe(
			"Build a bounded CLI in this directory. (Clone)",
		);
	});

	test("default-location clone derives fallback names from the first prompt line only", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-multiline-title-00000000000";
		const records: RolloutLine[] = [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: sourceThreadId,
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp/project",
					originator: "test",
					cli_version: "1.0.0",
					source: "exec",
				},
			},
			{
				timestamp: "2026-02-28T14:30:01.000Z",
				type: "response_item",
				payload: {
					type: "message",
					role: "user",
					content: [
						{
							type: "input_text",
							text: "Build a bounded v1 TypeScript npm CLI project in this directory.\n\nProject goal:\n- Create a deterministic text smoothing CLI.",
						},
					],
				},
			},
		];

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		expect(result.cloneThreadName).toBe(
			"Build a bounded v1 TypeScript npm CLI project in this directory. (Clone)",
		);
	});

	test("custom output path skips session_index updates even when a name is derived", async () => {
		const codexDir = await createTempDir();
		const outputDir = await createTempDir();
		const sourceThreadId = "source-custom-index-000000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1, events: ["user_message"] })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);
		await writeSessionIndexEntry(codexDir, sourceThreadId, "Task review");

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId, {
				outputPath: join(outputDir, "clone.jsonl"),
			}),
		);

		const sessionIndex = await readFile(
			join(codexDir, "session_index.jsonl"),
			"utf-8",
		);
		expect(result.cloneThreadName).toBe("Task review (Clone)");
		expect(result.sessionIndexUpdated).toBe(false);
		expect(sessionIndex.trim().split("\n")).toHaveLength(1);
	});

	test("synthesizes a user_message event only when needed for compatibility", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-synthesized-event-0000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);
		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);
		const userMessageEvents = outputRecords.filter(
			(record) =>
				record.type === "event_msg" &&
				(record.payload as { type?: string }).type === "user_message",
		);

		expect(userMessageEvents).toHaveLength(1);
		expect((userMessageEvents[0].payload as { message?: string }).message).toBe(
			"User message for turn 0",
		);
	});

	test("default clone preserves assistant replay events needed by Codex history reconstruction", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-replay-history-000000000000";
		const records: RolloutLine[] = [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: sourceThreadId,
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp/project",
					originator: "test",
					cli_version: "1.0.0",
					source: "vscode",
					model_provider: "openai",
				},
			},
			{
				timestamp: "2026-02-28T14:30:01.000Z",
				type: "turn_context",
				payload: {
					turn_id: "turn_0",
					cwd: "/tmp/project",
					model: "o4-mini",
					approval_policy: { mode: "auto" },
					sandbox_policy: { mode: "off" },
					summary: null,
				},
			},
			{
				timestamp: "2026-02-28T14:30:02.000Z",
				type: "event_msg",
				payload: {
					type: "turn_started",
				},
			},
			{
				timestamp: "2026-02-28T14:30:03.000Z",
				type: "event_msg",
				payload: {
					type: "user_message",
					message: "Review the draft",
				},
			},
			{
				timestamp: "2026-02-28T14:30:04.000Z",
				type: "event_msg",
				payload: {
					type: "agent_message",
					message: "I reviewed the draft.",
					phase: "commentary",
				},
			},
			{
				timestamp: "2026-02-28T14:30:05.000Z",
				type: "event_msg",
				payload: {
					type: "agent_reasoning",
					text: "Considering tradeoffs",
				},
			},
			{
				timestamp: "2026-02-28T14:30:06.000Z",
				type: "event_msg",
				payload: {
					type: "turn_complete",
				},
			},
			{
				timestamp: "2026-02-28T14:30:07.000Z",
				type: "response_item",
				payload: {
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "I reviewed the draft." }],
					end_turn: true,
				},
			},
		];

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);
		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);

		expect(
			outputRecords.some(
				(record) =>
					record.type === "event_msg" &&
					(record.payload as { type?: string }).type === "agent_message",
			),
		).toBe(true);
		expect(
			outputRecords.some(
				(record) =>
					record.type === "event_msg" &&
					(record.payload as { type?: string }).type === "turn_started",
			),
		).toBe(true);
		expect(
			outputRecords.some(
				(record) =>
					record.type === "event_msg" &&
					(record.payload as { type?: string }).type === "turn_complete",
			),
		).toBe(true);
	});

	test("fails when clone compatibility would require ambiguous user_message synthesis", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-ambiguous-synthesis-000000";
		const records: RolloutLine[] = [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: sourceThreadId,
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp/project",
					originator: "test",
					cli_version: "1.0.0",
					source: "test",
				},
			},
			{
				timestamp: "2026-02-28T14:30:01.000Z",
				type: "turn_context",
				payload: {
					cwd: "/tmp/project",
					model: "o4-mini",
					approval_policy: { mode: "auto" },
					sandbox_policy: { mode: "off" },
					summary: null,
				},
			},
			{
				timestamp: "2026-02-28T14:30:02.000Z",
				type: "response_item",
				payload: {
					type: "message",
					role: "user",
					content: [{ type: "input_image", image_url: "file:///tmp/test.png" }],
				},
			},
		];

		await writeTestSession(codexDir, sourceThreadId, records);

		await expect(
			executeCloneOperation(buildConfig(codexDir, sourceThreadId)),
		).rejects.toThrow("earliest surviving user message cannot be synthesized");
	});

	test("fails when clone compatibility has no surviving user message available for synthesis", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-no-user-message-0000000000";
		const records: RolloutLine[] = [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: sourceThreadId,
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/tmp/project",
					originator: "test",
					cli_version: "1.0.0",
					source: "test",
				},
			},
			{
				timestamp: "2026-02-28T14:30:01.000Z",
				type: "turn_context",
				payload: {
					cwd: "/tmp/project",
					model: "o4-mini",
					approval_policy: { mode: "auto" },
					sandbox_policy: { mode: "off" },
					summary: null,
				},
			},
			{
				timestamp: "2026-02-28T14:30:02.000Z",
				type: "event_msg",
				payload: {
					type: "agent_message",
					message: "This thread has no user prompt at all.",
				},
			},
			{
				timestamp: "2026-02-28T14:30:03.000Z",
				type: "response_item",
				payload: {
					type: "message",
					role: "assistant",
					content: [
						{
							type: "output_text",
							text: "This thread has no user prompt at all.",
						},
					],
					end_turn: true,
				},
			},
		];

		await writeTestSession(codexDir, sourceThreadId, records);

		await expect(
			executeCloneOperation(buildConfig(codexDir, sourceThreadId)),
		).rejects.toThrow(
			"no preserved user_message event and no surviving user message available for synthesis",
		);
	});

	test("rolls back the cloned rollout if session_index update fails", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-session-index-failure-0000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1, events: ["user_message"] })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);
		await writeSessionIndexEntry(codexDir, sourceThreadId, "Rollback source");
		await chmod(join(codexDir, "session_index.jsonl"), 0o444);

		await expect(
			executeCloneOperation(buildConfig(codexDir, sourceThreadId)),
		).rejects.toThrow("File write failed for");

		const sessionsDirEntries = await readdir(join(codexDir, "sessions"), {
			recursive: true,
		});
		const rolloutFiles = sessionsDirEntries.filter((entry) =>
			entry.endsWith(".jsonl"),
		);
		expect(rolloutFiles).toHaveLength(1);
	});

	// TC-8.5.1: statistics include all required counts
	test("TC-8.5.1: statistics include all required fields", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-stats-test-000000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({
				functionCalls: 2,
				reasoning: true,
				events: ["exec_command_begin", "user_message"],
			})
			.addTurn({ functionCalls: 1 })
			.addTurn({ functionCalls: 1, reasoning: true })
			.build();
		records.splice(records.length - 1, 0, {
			timestamp: "2025-01-15T10:00:40.000Z",
			type: "response_item",
			payload: {
				type: "ghost_snapshot",
				ghost_commit: { hash: "abc123" },
			},
		});

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		const stats = result.statistics;

		// All fields should be defined numbers
		expect(typeof stats.turnCountOriginal).toBe("number");
		expect(typeof stats.turnCountOutput).toBe("number");
		expect(typeof stats.functionCallsRemoved).toBe("number");
		expect(typeof stats.functionCallsTruncated).toBe("number");
		expect(typeof stats.reasoningBlocksRemoved).toBe("number");
		expect(typeof stats.eventMessagesRemoved).toBe("number");
		expect(typeof stats.turnContextRecordsRemoved).toBe("number");
		expect(typeof stats.ghostSnapshotsRemoved).toBe("number");
		expect(typeof stats.compactionDetected).toBe("boolean");
		expect(typeof stats.compactedRecordCount).toBe("number");
		expect(typeof stats.originalSizeBytes).toBe("number");
		expect(typeof stats.outputSizeBytes).toBe("number");
		expect(typeof stats.fileSizeReductionPercent).toBe("number");

		// Sanity checks
		expect(stats.originalSizeBytes).toBeGreaterThan(0);
		expect(stats.outputSizeBytes).toBeGreaterThan(0);
		expect(stats.outputSizeBytes).toBeLessThan(stats.originalSizeBytes);
		expect(stats.turnCountOriginal).toBe(3);
		expect(stats.reasoningBlocksRemoved).toBe(2);
		expect(stats.eventMessagesRemoved).toBeGreaterThan(0);
		expect(stats.ghostSnapshotsRemoved).toBeGreaterThan(0);
	});

	// TC-10.2.1: compaction detected in statistics
	test("TC-10.2.1: compaction detected in statistics", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-compaction-test-0000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1 })
			.addCompactedRecord()
			.addTurn({ functionCalls: 2 })
			.addTurn({ functionCalls: 1 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		expect(result.statistics.compactionDetected).toBe(true);
		expect(result.statistics.compactedRecordCount).toBeGreaterThan(0);
	});

	test("TC-10.2.1: compaction detected for response_item compaction only", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-compaction-item-only-0000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1 })
			.build();
		records.push({
			timestamp: "2025-01-15T10:00:50.000Z",
			type: "response_item",
			payload: {
				type: "compaction",
				encrypted_content: "enc_data",
			},
		});

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		expect(result.statistics.compactionDetected).toBe(true);
		expect(result.statistics.compactedRecordCount).toBe(1);
	});

	// Non-TC: Clone of session with zero tool calls
	test("clone of session with zero tool calls proceeds", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-no-tools-000000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ reasoning: true })
			.addTurn({ reasoning: true })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const warnings: string[] = [];
		const originalWarn = consola.warn;
		(consola as { warn: (...args: unknown[]) => void }).warn = (
			...args: unknown[]
		) => {
			warnings.push(args.map((arg) => String(arg)).join(" "));
		};

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		(consola as { warn: (...args: unknown[]) => void }).warn = originalWarn;

		expect(result.operationSucceeded).toBe(true);
		// Reasoning should still be stripped
		expect(result.statistics.reasoningBlocksRemoved).toBe(2);
		expect(
			warnings.some((warning) => warning.includes("Session has no tool calls")),
		).toBe(true);
	});

	// Non-TC: Clone of minimal session (just session_meta + one message)
	test("clone of minimal session succeeds", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-minimal-000000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn()
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		expect(result.operationSucceeded).toBe(true);
		expect(result.clonedThreadId).toBeDefined();
	});

	// target-cwd: cross-directory clone rewrites session_meta.cwd and turn_context.cwd
	test("target-cwd rewrites session_meta.cwd and all turn_context.cwd", async () => {
		const codexDir = await createTempDir();
		const targetDir = await createTempDir();
		const sourceThreadId = "source-target-cwd-rewrite-0000000";
		const records: RolloutLine[] = [
			{
				timestamp: "2026-02-28T14:30:00.000Z",
				type: "session_meta",
				payload: {
					id: sourceThreadId,
					timestamp: "2026-02-28T14:30:00.000Z",
					cwd: "/original/project",
					originator: "test",
					cli_version: "1.0.0",
					source: "exec",
					git: {
						commit_hash: "old_hash",
						branch: "old_branch",
						origin_url: "https://github.com/old/repo.git",
					},
				},
			},
			{
				timestamp: "2026-02-28T14:30:01.000Z",
				type: "turn_context",
				payload: {
					cwd: "/original/project",
					model: "o4-mini",
					approval_policy: { mode: "auto" },
					sandbox_policy: { mode: "off" },
					summary: null,
				},
			},
			{
				timestamp: "2026-02-28T14:30:02.000Z",
				type: "event_msg",
				payload: {
					type: "user_message",
					message: "Hello from original project",
				},
			},
			{
				timestamp: "2026-02-28T14:30:03.000Z",
				type: "response_item",
				payload: {
					type: "message",
					role: "user",
					content: [
						{ type: "input_text", text: "Hello from original project" },
					],
				},
			},
			{
				timestamp: "2026-02-28T14:30:04.000Z",
				type: "response_item",
				payload: {
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "Got it." }],
					end_turn: true,
				},
			},
		];

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId, { targetCwd: targetDir }),
		);

		expect(result.targetCwdApplied).toBe(targetDir);

		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);
		const meta = findSessionMeta(outputRecords);
		expect(meta!.cwd).toBe(targetDir);

		// All turn_context records should have updated cwd
		const turnContexts = outputRecords.filter(
			(r) => r.type === "turn_context",
		);
		for (const tc of turnContexts) {
			expect((tc.payload as TurnContextPayload).cwd).toBe(targetDir);
		}

		// Identity fields should still be correct
		expect(meta!.id).toBe(result.clonedThreadId);
		expect(meta!.forked_from_id).toBe(sourceThreadId);
	});

	// target-cwd: git metadata recomputed from target directory (git-backed)
	test("target-cwd recomputes git metadata from target repo", async () => {
		const codexDir = await createTempDir();
		const targetDir = await createTempDir();
		const sourceThreadId = "source-target-cwd-git-00000000000";

		// Initialize a git repo in the target directory with local identity
		execSync(
			"git init -b main && git -c user.name='Test' -c user.email='test@test.invalid' commit --allow-empty -m init",
			{ cwd: targetDir, stdio: "ignore" },
		);

		const records = new SessionBuilder()
			.addSessionMeta({
				id: sourceThreadId,
				cwd: "/original/project",
				git: {
					commit_hash: "stale_hash",
					branch: "stale_branch",
					origin_url: "https://github.com/stale/repo.git",
				},
			})
			.addTurn({ functionCalls: 1, events: ["user_message"] })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId, { targetCwd: targetDir }),
		);

		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);
		const meta = findSessionMeta(outputRecords);

		expect(meta!.cwd).toBe(targetDir);
		expect(meta!.git).toBeDefined();
		expect(meta!.git!.commit_hash).toBeDefined();
		expect(meta!.git!.commit_hash).not.toBe("stale_hash");
		expect(meta!.git!.branch).toBe("main");
		// No remote configured, so origin_url should be absent
		expect(meta!.git!.origin_url).toBeUndefined();
	});

	// target-cwd: non-git target directory clears git metadata
	test("target-cwd clears git metadata for non-git directory", async () => {
		const codexDir = await createTempDir();
		const targetDir = await createTempDir(); // plain dir, no git
		const sourceThreadId = "source-target-cwd-nogit-0000000";

		const records = new SessionBuilder()
			.addSessionMeta({
				id: sourceThreadId,
				cwd: "/original/project",
				git: {
					commit_hash: "abc123",
					branch: "main",
					origin_url: "https://github.com/user/repo.git",
				},
			})
			.addTurn({ functionCalls: 1, events: ["user_message"] })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId, { targetCwd: targetDir }),
		);

		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);
		const meta = findSessionMeta(outputRecords);

		expect(meta!.cwd).toBe(targetDir);
		expect(meta!.git).toBeUndefined();
	});

	// target-cwd: omitting flag preserves original cwd (regression guard)
	test("no target-cwd preserves original session cwd unchanged", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-no-target-cwd-000000000";
		const records = new SessionBuilder()
			.addSessionMeta({
				id: sourceThreadId,
				cwd: "/original/project",
				git: {
					commit_hash: "abc123",
					branch: "main",
				},
			})
			.addTurn({ functionCalls: 1, events: ["user_message"] })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);
		const meta = findSessionMeta(outputRecords);

		expect(meta!.cwd).toBe("/original/project");
		expect(meta!.git?.commit_hash).toBe("abc123");
		expect(meta!.git?.branch).toBe("main");
		expect(result.targetCwdApplied).toBeUndefined();
	});

	// target-cwd: result includes targetCwdApplied in output
	test("target-cwd sets targetCwdApplied in result", async () => {
		const codexDir = await createTempDir();
		const targetDir = await createTempDir();
		const sourceThreadId = "source-target-cwd-result-0000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1, events: ["user_message"] })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId, { targetCwd: targetDir }),
		);

		expect(result.targetCwdApplied).toBe(targetDir);
		expect(result.operationSucceeded).toBe(true);
	});

	// Non-TC: Concurrent clone operations (UUID uniqueness)
	test("concurrent clone operations produce unique thread IDs", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-concurrent-000000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		// Run two clones concurrently, both to custom output to avoid path collision
		const outputDir = await createTempDir();
		const config1 = buildConfig(codexDir, sourceThreadId, {
			outputPath: join(outputDir, "clone1.jsonl"),
		});
		const config2 = buildConfig(codexDir, sourceThreadId, {
			outputPath: join(outputDir, "clone2.jsonl"),
		});

		const [result1, result2] = await Promise.all([
			executeCloneOperation(config1),
			executeCloneOperation(config2),
		]);

		expect(result1.clonedThreadId).not.toBe(result2.clonedThreadId);
	});
});
