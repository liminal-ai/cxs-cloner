import { readdir, stat } from "node:fs/promises";
import { join } from "pathe";
import {
	AmbiguousMatchError,
	ArgumentValidationError,
	CxsError,
	SessionNotFoundError,
} from "../errors/clone-operation-errors.js";
import type {
	ScanOptions,
	SessionFileInfo,
} from "../types/clone-operation-types.js";

/** Filename regex: rollout-<YYYY-MM-DDTHH-MM-SS>-<uuid>.jsonl */
export const SESSION_FILENAME_REGEX =
	/^rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-(.+)\.jsonl$/;

/**
 * Parse a session filename into timestamp and UUID components.
 * Returns null if the filename doesn't match the expected pattern.
 */
function parseSessionFilename(
	fileName: string,
): { timestamp: string; threadId: string } | null {
	const match = SESSION_FILENAME_REGEX.exec(fileName);
	if (!match) {
		return null;
	}
	// Convert timestamp separators: 2026-02-28T14-30-00 → 2026-02-28T14:30:00
	const timestamp = match[1].replace(/T(\d{2})-(\d{2})-(\d{2})$/, "T$1:$2:$3");
	return { timestamp, threadId: match[2] };
}

/**
 * Walk ~/.codex/sessions/YYYY/MM/DD/ hierarchy.
 * Returns SessionFileInfo[] sorted newest first.
 * Applies options.limit if provided.
 * Throws CxsError if sessions directory doesn't exist.
 */
export async function scanSessionDirectory(
	codexDir: string,
	options?: ScanOptions,
): Promise<SessionFileInfo[]> {
	const sessionsDir = join(codexDir, "sessions");

	// Verify sessions directory exists
	try {
		const dirStat = await stat(sessionsDir);
		if (!dirStat.isDirectory()) {
			throw new CxsError(
				`Codex sessions directory not found at ${sessionsDir}`,
			);
		}
	} catch (error) {
		if (error instanceof CxsError) {
			throw error;
		}
		throw new CxsError(`Codex sessions directory not found at ${sessionsDir}`);
	}

	// Recursively read all entries
	const entries = await readdir(sessionsDir, {
		recursive: true,
		withFileTypes: true,
	});

	const sessions: SessionFileInfo[] = [];

	for (const entry of entries) {
		// Only process files (including symlinks that resolve to files)
		if (!entry.isFile() && !entry.isSymbolicLink()) {
			continue;
		}

		const fileName = entry.name;

		// Only process .jsonl files matching the session filename pattern
		const parsed = parseSessionFilename(fileName);
		if (!parsed) {
			continue;
		}

		// Construct the full path from the Dirent's parentPath
		const parentDir = entry.parentPath ?? sessionsDir;
		const filePath = join(parentDir, fileName);

		sessions.push({
			filePath,
			threadId: parsed.threadId,
			createdAt: new Date(parsed.timestamp),
			fileName,
		});
	}

	// Sort newest first (descending by createdAt)
	sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

	// Apply limit if specified
	if (options?.limit !== undefined && options.limit > 0) {
		return sessions.slice(0, options.limit);
	}

	return sessions;
}

/**
 * Find a session by partial UUID prefix match.
 * Exactly one match → returns SessionFileInfo.
 * Multiple matches → throws AmbiguousMatchError.
 * No match → throws SessionNotFoundError.
 * Empty partialId → throws ArgumentValidationError.
 */
export async function findSessionByPartialId(
	codexDir: string,
	partialId: string,
): Promise<SessionFileInfo> {
	if (partialId.length === 0) {
		throw new ArgumentValidationError(
			"sessionId",
			"Session ID must not be empty",
		);
	}

	const sessions = await scanSessionDirectory(codexDir);
	const matches = sessions.filter((s) => s.threadId.startsWith(partialId));

	if (matches.length === 0) {
		const candidates = buildCandidateSessionIds(sessions, partialId);
		throw new SessionNotFoundError(
			partialId,
			candidates.length > 0 ? candidates : undefined,
		);
	}

	if (matches.length > 1) {
		throw new AmbiguousMatchError(
			partialId,
			matches.map((m) => m.threadId),
		);
	}

	return matches[0];
}

function buildCandidateSessionIds(
	sessions: SessionFileInfo[],
	partialId: string,
): string[] {
	if (sessions.length === 0) {
		return [];
	}

	const normalizedPartial = partialId.toLowerCase();
	const ranked = sessions
		.map((session) => {
			const threadId = session.threadId.toLowerCase();
			let score = 0;
			if (threadId.includes(normalizedPartial)) {
				score += 3;
			}
			if (
				normalizedPartial.includes(threadId.slice(0, normalizedPartial.length))
			) {
				score += 2;
			}
			if (threadId.startsWith(normalizedPartial.slice(0, 4))) {
				score += 1;
			}
			return { score, threadId: session.threadId };
		})
		.filter((candidate) => candidate.score > 0)
		.sort((a, b) => b.score - a.score)
		.map((candidate) => candidate.threadId);

	const uniqueRanked = [...new Set(ranked)];
	if (uniqueRanked.length === 0) {
		return sessions.slice(0, 5).map((session) => session.threadId);
	}
	return uniqueRanked.slice(0, 5);
}
