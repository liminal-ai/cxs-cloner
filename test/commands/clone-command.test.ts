import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { cloneCommand } from "../../src/commands/clone-command.js";
import type { RolloutLine } from "../../src/types/codex-session-types.js";

describe("clone-command", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "cxs-clone-command-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("runs happy path and prints clone output", async () => {
		const codexDir = join(tmpDir, "codex");
		const threadId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		await writeSession(codexDir, threadId);

		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => {
			logs.push(args.map((arg) => String(arg)).join(" "));
		};

		await cloneCommand.run!({
			args: {
				sessionId: threadId.slice(0, 8),
				"codex-dir": codexDir,
				"strip-tools": "true",
				json: false,
				verbose: false,
			},
		} as never);

		console.log = originalLog;
		expect(logs.join("\n")).toContain("Clone completed successfully");
	});

	it("supports JSON output mode", async () => {
		const codexDir = join(tmpDir, "codex-json");
		const threadId = "11111111-2222-3333-4444-555555555555";
		await writeSession(codexDir, threadId);

		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => {
			logs.push(args.map((arg) => String(arg)).join(" "));
		};

		await cloneCommand.run!({
			args: {
				sessionId: threadId.slice(0, 8),
				"codex-dir": codexDir,
				"strip-tools": "true",
				json: true,
				verbose: false,
			},
		} as never);

		console.log = originalLog;
		const parsed = JSON.parse(logs.join("\n")) as {
			success: boolean;
			clonedThreadId: string;
			cloneTimestamp: string;
			sessionIndexUpdated: boolean;
		};
		expect(parsed.success).toBe(true);
		expect(parsed.clonedThreadId).toBeDefined();
		expect(parsed.cloneTimestamp).toBeDefined();
		expect(typeof parsed.sessionIndexUpdated).toBe("boolean");
	});

	it("rejects --target-cwd pointing to a non-existent path", async () => {
		const codexDir = join(tmpDir, "codex-bad-cwd");
		const threadId = "cccccccc-dddd-eeee-ffff-000000000000";
		await writeSession(codexDir, threadId);

		const errors: string[] = [];
		const originalError = console.error;
		console.error = (...args: unknown[]) => {
			errors.push(args.map((arg) => String(arg)).join(" "));
		};

		let exitCode: number | undefined;
		const originalExit = process.exit;
		(process as { exit: (code?: number) => never }).exit = (code?: number) => {
			exitCode = code;
			throw new Error("process.exit called");
		};

		await expect(
			cloneCommand.run!({
				args: {
					sessionId: threadId.slice(0, 8),
					"codex-dir": codexDir,
					"strip-tools": "true",
					"target-cwd": "/nonexistent/path/that/does/not/exist",
					json: false,
					verbose: false,
				},
			} as never),
		).rejects.toThrow("process.exit called");

		console.error = originalError;
		(process as { exit: (code?: number) => never }).exit = originalExit;

		expect(exitCode).toBe(1);
		expect(errors.join("\n")).toContain("not readable");
	});

	it("rejects --target-cwd pointing to a file instead of directory", async () => {
		const codexDir = join(tmpDir, "codex-file-cwd");
		const threadId = "dddddddd-eeee-ffff-0000-111111111111";
		await writeSession(codexDir, threadId);

		const filePath = join(tmpDir, "not-a-dir.txt");
		await writeFile(filePath, "I am a file");

		const errors: string[] = [];
		const originalError = console.error;
		console.error = (...args: unknown[]) => {
			errors.push(args.map((arg) => String(arg)).join(" "));
		};

		let exitCode: number | undefined;
		const originalExit = process.exit;
		(process as { exit: (code?: number) => never }).exit = (code?: number) => {
			exitCode = code;
			throw new Error("process.exit called");
		};

		await expect(
			cloneCommand.run!({
				args: {
					sessionId: threadId.slice(0, 8),
					"codex-dir": codexDir,
					"strip-tools": "true",
					"target-cwd": filePath,
					json: false,
					verbose: false,
				},
			} as never),
		).rejects.toThrow("process.exit called");

		console.error = originalError;
		(process as { exit: (code?: number) => never }).exit = originalExit;

		expect(exitCode).toBe(1);
		expect(errors.join("\n")).toContain("not a directory");
	});

	it("handles invalid arguments with error output and exit code 1", async () => {
		const errors: string[] = [];
		const originalError = console.error;
		console.error = (...args: unknown[]) => {
			errors.push(args.map((arg) => String(arg)).join(" "));
		};

		let exitCode: number | undefined;
		const originalExit = process.exit;
		(process as { exit: (code?: number) => never }).exit = (code?: number) => {
			exitCode = code;
			throw new Error("process.exit called");
		};

		await expect(
			cloneCommand.run!({
				args: {
					sessionId: "anything",
					json: false,
					verbose: false,
				},
			} as never),
		).rejects.toThrow("process.exit called");

		console.error = originalError;
		(process as { exit: (code?: number) => never }).exit = originalExit;

		expect(exitCode).toBe(1);
		expect(errors.join("\n")).toContain(
			"At least one stripping flag is required",
		);
	});
});

async function writeSession(codexDir: string, threadId: string): Promise<void> {
	const sessionDir = join(codexDir, "sessions", "2026", "02", "28");
	await mkdir(sessionDir, { recursive: true });
	const filePath = join(
		sessionDir,
		`rollout-2026-02-28T14-30-00-${threadId}.jsonl`,
	);
	const records: RolloutLine[] = [
		{
			timestamp: "2026-02-28T14:30:00.000Z",
			type: "session_meta",
			payload: {
				id: threadId,
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
				content: [{ type: "input_text", text: "Hello from clone test" }],
			},
		},
		{
			timestamp: "2026-02-28T14:30:03.000Z",
			type: "response_item",
			payload: {
				type: "function_call",
				name: "read_file",
				arguments: "{}",
				call_id: "call_1",
			},
		},
		{
			timestamp: "2026-02-28T14:30:04.000Z",
			type: "response_item",
			payload: {
				type: "function_call_output",
				call_id: "call_1",
				output: "ok",
			},
		},
	];
	await writeFile(
		filePath,
		records.map((record) => JSON.stringify(record)).join("\n"),
	);
}
