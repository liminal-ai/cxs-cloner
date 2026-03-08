import { randomUUID } from "node:crypto";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "pathe";
import { FileOperationError } from "../errors/clone-operation-errors.js";
import type {
	WriteResult,
	WriteSessionOptions,
} from "../types/clone-operation-types.js";
import type { RolloutLine } from "../types/codex-session-types.js";

/**
 * Generate the default output path for a cloned session.
 * Format: {codexDir}/sessions/YYYY/MM/DD/rollout-<timestamp>-<threadId>.jsonl
 * Uses the canonical clone timestamp for the directory hierarchy.
 */
function generateDefaultPath(
	codexDir: string,
	threadId: string,
	cloneTimestamp: Date,
): string {
	const now = cloneTimestamp;
	const year = now.getFullYear().toString();
	const month = (now.getMonth() + 1).toString().padStart(2, "0");
	const day = now.getDate().toString().padStart(2, "0");

	// Timestamp for filename: YYYY-MM-DDTHH-MM-SS
	const hours = now.getHours().toString().padStart(2, "0");
	const minutes = now.getMinutes().toString().padStart(2, "0");
	const seconds = now.getSeconds().toString().padStart(2, "0");
	const timestamp = `${year}-${month}-${day}T${hours}-${minutes}-${seconds}`;

	const fileName = `rollout-${timestamp}-${threadId}.jsonl`;
	return join(codexDir, "sessions", year, month, day, fileName);
}

/**
 * Serialize records to JSONL content (one JSON object per line).
 */
function serializeToJsonl(records: RolloutLine[]): string {
	return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

/**
 * Write cloned session to disk.
 * When outputPath is null: generates path in codexDir/sessions/YYYY/MM/DD/.
 * Creates directories as needed. Atomic write (temp + rename).
 */
export async function writeClonedSession(
	records: RolloutLine[],
	options: WriteSessionOptions,
): Promise<WriteResult> {
	const isDefaultLocation = options.outputPath === null;
	const filePath =
		options.outputPath === null
			? generateDefaultPath(
					options.codexDir,
					options.threadId,
					options.cloneTimestamp,
				)
			: options.outputPath;

	// Create parent directories
	const dir = dirname(filePath);
	try {
		await mkdir(dir, { recursive: true });
	} catch (error) {
		throw new FileOperationError(
			filePath,
			"write",
			`Failed to create directory "${dir}": ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	// Serialize records to JSONL
	const content = serializeToJsonl(records);

	// Atomic write: write to temp file, then rename
	const tempPath = `${filePath}.${randomUUID()}.tmp`;

	try {
		await writeFile(tempPath, content, "utf-8");

		// Get the file size before rename
		const fileStat = await stat(tempPath);
		const sizeBytes = fileStat.size;

		await rename(tempPath, filePath);

		return { filePath, sizeBytes, isDefaultLocation };
	} catch (error) {
		// Clean up temp file on failure
		try {
			await unlink(tempPath);
		} catch {
			// Temp file may not exist if writeFile failed early
		}
		throw new FileOperationError(
			filePath,
			"write",
			error instanceof Error ? error.message : String(error),
		);
	}
}
