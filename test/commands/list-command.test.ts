import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import consola from "consola";
import { join } from "pathe";
import { listCommand } from "../../src/commands/list-command.js";
import type { RolloutLine } from "../../src/types/codex-session-types.js";

describe("list-command", () => {
	let tmpDir: string;
	let savedCodexDir: string | undefined;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "cxs-list-command-"));
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
		await writeSession(codexDir, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
		process.env.CXS_CLONER_CODEX_DIR = codexDir;

		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => {
			logs.push(args.map((arg) => String(arg)).join(" "));
		};

		await listCommand.run!({
			args: { json: true, verbose: false },
		} as never);

		console.log = originalLog;

		const parsed = JSON.parse(logs.join("\n")) as Array<{ threadId: string }>;
		expect(parsed).toHaveLength(1);
		expect(parsed[0].threadId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
	});

	it("prints cwd in default human output", async () => {
		const codexDir = join(tmpDir, "codex-list");
		await writeSession(
			codexDir,
			"11111111-2222-3333-4444-555555555555",
			"/tmp/project-cwd",
		);

		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => {
			logs.push(args.map((arg) => String(arg)).join(" "));
		};

		await listCommand.run!({
			args: { "codex-dir": codexDir, json: false, verbose: false },
		} as never);

		console.log = originalLog;

		expect(logs.join("\n")).toContain("/tmp/project-cwd");
	});

	it("handles invalid --limit with error output and exit code 1", async () => {
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
			listCommand.run!({
				args: { limit: "0", json: false, verbose: false },
			} as never),
		).rejects.toThrow("process.exit called");

		(consola as { error: (...args: unknown[]) => void }).error = originalError;
		(process as { exit: (code?: number) => never }).exit = originalExit;

		expect(exitCode).toBe(1);
		expect(errors.join("\n")).toContain("--limit must be a positive number");
	});
});

async function writeSession(
	codexDir: string,
	threadId: string,
	cwd = "/tmp/project",
): Promise<void> {
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
				cwd,
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
				content: [{ type: "input_text", text: "Hello from list test" }],
			},
		},
	];
	await writeFile(
		filePath,
		records.map((record) => JSON.stringify(record)).join("\n"),
	);
}
