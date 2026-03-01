import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import consola from "consola";
import { join } from "pathe";
import { infoCommand } from "../../src/commands/info-command.js";
import type { RolloutLine } from "../../src/types/codex-session-types.js";

describe("info-command", () => {
	let tmpDir: string;
	let savedCodexDir: string | undefined;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "cxs-info-command-"));
		savedCodexDir = process.env.CXS_CLONER_CODEX_DIR;
		delete process.env.CXS_CLONER_CODEX_DIR;
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
		if (savedCodexDir === undefined) {
			delete process.env.CXS_CLONER_CODEX_DIR;
		} else {
			process.env.CXS_CLONER_CODEX_DIR = savedCodexDir;
		}
	});

	it("uses CXS_CLONER_CODEX_DIR when --codex-dir is not provided", async () => {
		const codexDir = join(tmpDir, "codex-env");
		const threadId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		await writeSession(codexDir, threadId);
		process.env.CXS_CLONER_CODEX_DIR = codexDir;

		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => {
			logs.push(args.map((arg) => String(arg)).join(" "));
		};

		await infoCommand.run!({
			args: { sessionId: threadId.slice(0, 8), json: true, verbose: false },
		} as never);

		console.log = originalLog;

		const parsed = JSON.parse(logs.join("\n")) as { threadId: string };
		expect(parsed.threadId).toBe(threadId);
	});

	it("shows default record summary in human output", async () => {
		const codexDir = join(tmpDir, "codex-info");
		const threadId = "11111111-2222-3333-4444-555555555555";
		await writeSession(codexDir, threadId);

		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => {
			logs.push(args.map((arg) => String(arg)).join(" "));
		};

		await infoCommand.run!({
			args: {
				sessionId: threadId.slice(0, 8),
				"codex-dir": codexDir,
				json: false,
				verbose: false,
			},
		} as never);

		console.log = originalLog;

		expect(logs.join("\n")).toContain("Records:");
	});

	it("handles session-not-found with error output and exit code 1", async () => {
		const codexDir = join(tmpDir, "codex-empty");
		await mkdir(join(codexDir, "sessions"), { recursive: true });

		const errors: string[] = [];
		const originalError = consola.error;
		(consola as { error: (...args: unknown[]) => void }).error = (
			...args: unknown[]
		) => {
			errors.push(args.map((arg) => String(arg)).join(" "));
		};

		let exitCode: number | undefined;
		const originalExit = process.exit;
		(process as { exit: (code?: number) => never }).exit = (code?: number) => {
			exitCode = code;
			throw new Error("process.exit called");
		};

		await expect(
			infoCommand.run!({
				args: {
					sessionId: "does-not-exist",
					"codex-dir": codexDir,
					json: false,
					verbose: false,
				},
			} as never),
		).rejects.toThrow("process.exit called");

		(consola as { error: (...args: unknown[]) => void }).error = originalError;
		(process as { exit: (code?: number) => never }).exit = originalExit;

		expect(exitCode).toBe(1);
		expect(errors.join("\n")).toContain('Session "does-not-exist" not found');
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
				content: [{ type: "input_text", text: "Hello from info test" }],
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
	];
	await writeFile(
		filePath,
		records.map((record) => JSON.stringify(record)).join("\n"),
	);
}
