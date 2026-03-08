import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitInfo } from "../types/codex-session-types.js";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 5000;

/**
 * Probe git metadata from a directory.
 * Returns null if the directory is not a git repo or git is unavailable.
 * Non-fatal: never throws on expected git failures.
 *
 * Assumes the caller has already validated that `cwd` is a readable directory.
 * All git errors (including ENOENT/EACCES) are treated as "not a git repo."
 */
export async function probeGitInfo(cwd: string): Promise<GitInfo | null> {
	try {
		// Quick check: is this a git repo at all?
		await execFileAsync("git", ["rev-parse", "--git-dir"], {
			cwd,
			timeout: GIT_TIMEOUT_MS,
		});
	} catch {
		return null;
	}

	const [commitHash, branch, originUrl] = await Promise.all([
		gitCommand(cwd, ["rev-parse", "HEAD"]),
		gitBranch(cwd),
		gitCommand(cwd, ["config", "--get", "remote.origin.url"]),
	]);

	// gitCommand returns string | null; GitInfo fields are string | undefined.
	// Coerce null → undefined to match the interface.
	return {
		commit_hash: commitHash ?? undefined,
		branch: branch ?? undefined,
		origin_url: originUrl ?? undefined,
		repository_url: originUrl ?? undefined,
	};
}

/**
 * Get the current branch name, or null if on detached HEAD.
 * Does not fall back to a commit hash — `branch` should be a branch name or absent.
 */
async function gitBranch(cwd: string): Promise<string | null> {
	return gitCommand(cwd, ["symbolic-ref", "--short", "HEAD"]);
}

async function gitCommand(
	cwd: string,
	args: string[],
): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync("git", args, {
			cwd,
			timeout: GIT_TIMEOUT_MS,
		});
		const trimmed = stdout.trim();
		return trimmed === "" ? null : trimmed;
	} catch {
		return null;
	}
}
