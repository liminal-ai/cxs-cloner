import { afterEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { probeGitInfo } from "../../src/core/git-probe.js";

let tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "cxs-git-probe-"));
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

function initGitRepo(cwd: string, branch = "main"): void {
	execSync(
		`git init -b ${branch} && git -c user.name='Test' -c user.email='test@test.invalid' commit --allow-empty -m init`,
		{ cwd, stdio: "ignore" },
	);
}

describe("probeGitInfo", () => {
	test("returns null for a non-git directory", async () => {
		const dir = await createTempDir();
		const result = await probeGitInfo(dir);
		expect(result).toBeNull();
	});

	test("returns commit hash and branch for a git repo", async () => {
		const dir = await createTempDir();
		initGitRepo(dir, "main");

		const result = await probeGitInfo(dir);

		expect(result).not.toBeNull();
		expect(result!.commit_hash).toMatch(/^[0-9a-f]{40}$/);
		expect(result!.branch).toBe("main");
	});

	test("returns undefined branch on detached HEAD", async () => {
		const dir = await createTempDir();
		initGitRepo(dir, "main");
		// Detach HEAD
		const hash = execSync("git rev-parse HEAD", { cwd: dir })
			.toString()
			.trim();
		execSync(`git checkout ${hash}`, { cwd: dir, stdio: "ignore" });

		const result = await probeGitInfo(dir);

		expect(result).not.toBeNull();
		expect(result!.commit_hash).toBe(hash);
		expect(result!.branch).toBeUndefined();
	});

	test("returns undefined origin_url when no remote is configured", async () => {
		const dir = await createTempDir();
		initGitRepo(dir);

		const result = await probeGitInfo(dir);

		expect(result).not.toBeNull();
		expect(result!.origin_url).toBeUndefined();
		expect(result!.repository_url).toBeUndefined();
	});

	test("returns origin_url and repository_url when remote is configured", async () => {
		const dir = await createTempDir();
		initGitRepo(dir);
		execSync("git remote add origin https://github.com/test/repo.git", {
			cwd: dir,
			stdio: "ignore",
		});

		const result = await probeGitInfo(dir);

		expect(result).not.toBeNull();
		expect(result!.origin_url).toBe("https://github.com/test/repo.git");
		expect(result!.repository_url).toBe(
			"https://github.com/test/repo.git",
		);
	});

	test("returns null for a nonexistent path", async () => {
		const result = await probeGitInfo("/nonexistent/path/that/does/not/exist");
		expect(result).toBeNull();
	});

	test("returns null for a file path (not a directory)", async () => {
		const dir = await createTempDir();
		const filePath = join(dir, "not-a-dir.txt");
		await writeFile(filePath, "I am a file");

		const result = await probeGitInfo(filePath);
		expect(result).toBeNull();
	});
});
