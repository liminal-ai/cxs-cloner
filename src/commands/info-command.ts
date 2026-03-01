import { defineCommand } from "citty";
import consola from "consola";
import { loadConfiguration } from "../config/configuration-loader.js";
import { CxsError } from "../errors/clone-operation-errors.js";
import { findSessionByPartialId } from "../io/session-directory-scanner.js";
import {
	computeSessionStatistics,
	parseSessionFile,
} from "../io/session-file-reader.js";
import { formatSessionInfo } from "../output/session-formatters.js";

export const infoCommand = defineCommand({
	meta: {
		name: "info",
		description: "Show detailed information about a Codex session",
	},
	args: {
		sessionId: {
			type: "positional",
			description: "Session ID (full or partial UUID)",
			required: true,
		},
		"codex-dir": {
			type: "string",
			description: "Override default Codex directory (~/.codex)",
		},
		json: {
			type: "boolean",
			description: "Output as JSON",
			default: false,
		},
		verbose: {
			type: "boolean",
			description: "Show per-type record breakdown",
			default: false,
		},
	},
	async run({ args }) {
		const jsonOutput = args.json ?? false;
		const verbose = args.verbose ?? false;

		try {
			const cxsConfig = await loadConfiguration(
				args["codex-dir"] ? { codexDir: args["codex-dir"] } : undefined,
			);
			const codexDir = cxsConfig.codexDir;
			const session = await findSessionByPartialId(codexDir, args.sessionId);
			const parsed = await parseSessionFile(session.filePath);
			const stats = computeSessionStatistics(parsed);
			const output = formatSessionInfo(
				{
					threadId: parsed.metadata.id,
					cwd: parsed.metadata.cwd,
					cliVersion: parsed.metadata.cli_version,
					modelProvider: parsed.metadata.model_provider,
					git: parsed.metadata.git,
					stats,
				},
				{
					json: jsonOutput,
					verbose,
				},
			);
			console.log(output);
		} catch (error) {
			if (error instanceof CxsError) {
				consola.error(error.message);
				process.exit(1);
			}
			throw error;
		}
	},
});
