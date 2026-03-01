import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import {
	AmbiguousMatchError,
	ArgumentValidationError,
	CxsError,
	SessionNotFoundError,
} from "../../src/errors/clone-operation-errors.js";
import {
	findSessionByPartialId,
	scanSessionDirectory,
} from "../../src/io/session-directory-scanner.js";

/** Minimal valid JSONL content for a session file. */
const MINIMAL_JSONL =
	'{"timestamp":"2025-01-15T10:00:00.000Z","type":"session_meta","payload":{"id":"test","timestamp":"2025-01-15T10:00:00.000Z","cwd":"/tmp","originator":"test","cli_version":"1.0.0","source":"test"}}\n';

/** Helper to create a session file in the proper directory hierarchy. */
async function createSessionFile(
	sessionsDir: string,
	year: string,
	month: string,
	day: string,
	filename: string,
	content: string = MINIMAL_JSONL,
): Promise<string> {
	const dateDir = join(sessionsDir, year, month, day);
	await mkdir(dateDir, { recursive: true });
	const filePath = join(dateDir, filename);
	await writeFile(filePath, content);
	return filePath;
}

describe("session-directory-scanner", () => {
	let tmpDir: string;
	let codexDir: string;
	let sessionsDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "cxs-scanner-"));
		codexDir = join(tmpDir, ".codex");
		sessionsDir = join(codexDir, "sessions");
		await mkdir(sessionsDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("TC-1.1.1: discovers two sessions in one date directory", async () => {
		await createSessionFile(
			sessionsDir,
			"2026",
			"02",
			"28",
			"rollout-2026-02-28T14-30-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl",
		);
		await createSessionFile(
			sessionsDir,
			"2026",
			"02",
			"28",
			"rollout-2026-02-28T15-00-00-11111111-2222-3333-4444-555555555555.jsonl",
		);

		const results = await scanSessionDirectory(codexDir);

		expect(results).toHaveLength(2);
	});

	it("TC-1.1.2: sorts sessions newest first across date directories", async () => {
		await createSessionFile(
			sessionsDir,
			"2026",
			"01",
			"15",
			"rollout-2026-01-15T10-00-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl",
		);
		await createSessionFile(
			sessionsDir,
			"2026",
			"02",
			"28",
			"rollout-2026-02-28T14-30-00-11111111-2222-3333-4444-555555555555.jsonl",
		);

		const results = await scanSessionDirectory(codexDir);

		expect(results).toHaveLength(2);
		// First result should be the newest (Feb 28)
		expect(results[0].createdAt.getTime()).toBeGreaterThan(
			results[1].createdAt.getTime(),
		);
		expect(results[0].threadId).toBe("11111111-2222-3333-4444-555555555555");
	});

	it("TC-1.1.3: returns empty for empty sessions directory", async () => {
		const results = await scanSessionDirectory(codexDir);

		expect(results).toEqual([]);
	});

	it("TC-1.2.1: extracts timestamp and UUID from filename", async () => {
		const uuid = "019ba2c8-d0d3-7a12-9483-256375a8b26a";
		await createSessionFile(
			sessionsDir,
			"2026",
			"02",
			"28",
			`rollout-2026-02-28T14-30-00-${uuid}.jsonl`,
		);

		const results = await scanSessionDirectory(codexDir);

		expect(results).toHaveLength(1);
		expect(results[0].threadId).toBe(uuid);
		// Timestamp should be parsed: 2026-02-28T14:30:00 (colons restored)
		const expected = new Date("2026-02-28T14:30:00");
		expect(results[0].createdAt.getTime()).toBe(expected.getTime());
	});

	it("TC-1.4.1: limit caps returned sessions", async () => {
		// Create 50 session files across multiple date directories
		for (let i = 0; i < 50; i++) {
			const day = String((i % 28) + 1).padStart(2, "0");
			const hour = String(i % 24).padStart(2, "0");
			const minute = String(i % 60).padStart(2, "0");
			const uuid = `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
			await createSessionFile(
				sessionsDir,
				"2026",
				"02",
				day,
				`rollout-2026-02-${day}T${hour}-${minute}-00-${uuid}.jsonl`,
			);
		}

		const results = await scanSessionDirectory(codexDir, { limit: 10 });

		expect(results).toHaveLength(10);
		// Verify the 10 returned are sorted newest first
		for (let i = 1; i < results.length; i++) {
			expect(results[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
				results[i].createdAt.getTime(),
			);
		}
		// Verify these are actually the newest 10 (not arbitrary ones)
		const allResults = await scanSessionDirectory(codexDir);
		expect(allResults[0].createdAt.getTime()).toBe(
			results[0].createdAt.getTime(),
		);
	});

	it("TC-1.5.1: codex-dir override scans custom path", async () => {
		// Create a separate custom codex directory
		const customCodexDir = join(tmpDir, "custom-codex");
		const customSessionsDir = join(customCodexDir, "sessions");
		await createSessionFile(
			customSessionsDir,
			"2026",
			"03",
			"01",
			"rollout-2026-03-01T09-00-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl",
		);

		const results = await scanSessionDirectory(customCodexDir);

		expect(results).toHaveLength(1);
		expect(results[0].threadId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
	});

	it("skips non-JSONL files in session directories", async () => {
		await createSessionFile(
			sessionsDir,
			"2026",
			"02",
			"28",
			"rollout-2026-02-28T14-30-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl",
		);
		// Create a non-JSONL file
		const dateDir = join(sessionsDir, "2026", "02", "28");
		await writeFile(join(dateDir, "notes.txt"), "not a session file");
		await writeFile(join(dateDir, ".DS_Store"), "");

		const results = await scanSessionDirectory(codexDir);

		expect(results).toHaveLength(1);
	});

	it("follows symlinks and includes linked session files", async () => {
		// Create actual file in a different location
		const externalDir = join(tmpDir, "external");
		await mkdir(externalDir, { recursive: true });
		const externalFile = join(
			externalDir,
			"rollout-2026-02-28T14-30-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl",
		);
		await writeFile(externalFile, MINIMAL_JSONL);

		// Create symlink in the sessions directory
		const dateDir = join(sessionsDir, "2026", "02", "28");
		await mkdir(dateDir, { recursive: true });
		const linkPath = join(
			dateDir,
			"rollout-2026-02-28T14-30-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl",
		);
		await symlink(externalFile, linkPath);

		const results = await scanSessionDirectory(codexDir);

		expect(results).toHaveLength(1);
		expect(results[0].threadId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
	});

	it("throws clear error when sessions directory is missing", async () => {
		const missingCodexDir = join(tmpDir, "missing-codex");

		await expect(scanSessionDirectory(missingCodexDir)).rejects.toThrow(
			CxsError,
		);
		await expect(scanSessionDirectory(missingCodexDir)).rejects.toThrow(
			`Codex sessions directory not found at ${join(missingCodexDir, "sessions")}`,
		);
	});
});

// ─── Story 2: findSessionByPartialId ───────────────────────────

describe("findSessionByPartialId", () => {
	let tmpDir: string;
	let codexDir: string;
	let sessionsDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "cxs-partial-"));
		codexDir = join(tmpDir, ".codex");
		sessionsDir = join(codexDir, "sessions");
		await mkdir(sessionsDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("TC-2.5.1: finds session by partial UUID prefix", async () => {
		const uuid = "019ba2c8-d0d3-7a12-9483-256375a8b26a";
		await createSessionFile(
			sessionsDir,
			"2026",
			"02",
			"28",
			`rollout-2026-02-28T14-30-00-${uuid}.jsonl`,
		);

		const result = await findSessionByPartialId(codexDir, "019ba2c8");

		expect(result.threadId).toBe(uuid);
	});

	it("TC-2.5.2: errors on ambiguous partial ID with matches listed", async () => {
		const uuid1 = "019ba2c8-d0d3-7a12-9483-256375a8b26a";
		const uuid2 = "019ba2c8-ffff-0000-1111-222222222222";
		await createSessionFile(
			sessionsDir,
			"2026",
			"02",
			"28",
			`rollout-2026-02-28T14-30-00-${uuid1}.jsonl`,
		);
		await createSessionFile(
			sessionsDir,
			"2026",
			"02",
			"28",
			`rollout-2026-02-28T15-00-00-${uuid2}.jsonl`,
		);

		await expect(findSessionByPartialId(codexDir, "019ba2c8")).rejects.toThrow(
			AmbiguousMatchError,
		);

		try {
			await findSessionByPartialId(codexDir, "019ba2c8");
		} catch (error) {
			expect(error).toBeInstanceOf(AmbiguousMatchError);
			const amError = error as AmbiguousMatchError;
			expect(amError.matches).toContain(uuid1);
			expect(amError.matches).toContain(uuid2);
			expect(amError.partialId).toBe("019ba2c8");
		}
	});

	it("non-TC: empty partial ID throws ArgumentValidationError", async () => {
		await expect(findSessionByPartialId(codexDir, "")).rejects.toThrow(
			ArgumentValidationError,
		);
	});

	it("provides candidate IDs on session-not-found", async () => {
		const uuid1 = "aaaaaaaa-bbbb-cccc-dddd-111111111111";
		const uuid2 = "bbbbbbbb-cccc-dddd-eeee-222222222222";
		await createSessionFile(
			sessionsDir,
			"2026",
			"02",
			"28",
			`rollout-2026-02-28T14-30-00-${uuid1}.jsonl`,
		);
		await createSessionFile(
			sessionsDir,
			"2026",
			"02",
			"28",
			`rollout-2026-02-28T15-00-00-${uuid2}.jsonl`,
		);

		try {
			await findSessionByPartialId(codexDir, "not-found");
		} catch (error) {
			expect(error).toBeInstanceOf(SessionNotFoundError);
			const notFoundError = error as SessionNotFoundError;
			expect(notFoundError.candidates).toBeDefined();
			expect(notFoundError.candidates!.length).toBeGreaterThan(0);
		}
	});
});
