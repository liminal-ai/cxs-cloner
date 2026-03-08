import { defineCommand } from "citty";
import { cloneCommand } from "./clone-command.js";
import { infoCommand } from "./info-command.js";
import { listCommand } from "./list-command.js";

const VERSION = "0.1.0";

const HELP_TEXT = `cxs-cloner v${VERSION} - Clone Codex sessions with reduced context

USAGE
  cxs-cloner <command> [options]

COMMANDS
  clone <id>   Clone session with modifications
  list         List sessions
  info <id>    Show session details

PRESETS (for --strip-tools)
  default      Keep 20 tool-turns: 50% truncated, 50% full fidelity
  aggressive   Keep 10 tool-turns: 70% truncated, 30% full fidelity
  heavy        Keep 10 tool-turns: 80% truncated, 20% full fidelity
  extreme      Remove all tools

HOW IT WORKS
  Tool removal targets "turns with tools" (not all turns).
  Of kept turns, oldest portion is truncated, newest is full fidelity.
  This ensures consistent behavior across multiple clones.

CUSTOM PRESETS
  Define in cxs-cloner.config.ts:
    customPresets: {
      minimal: { name: "minimal", keepTurnsWithTools: 5, truncatePercent: 80 }
    }

OUTPUT OPTIONS
  --json       JSON output (for agents)

GLOBAL OPTIONS
  --help, -h       Show help
  --version        Show version

ENVIRONMENT
  CXS_CODEX_DIR              Codex data directory (default: ~/.codex)

Run "cxs-cloner <command> --help" for command-specific options.`;

export const mainCommand = defineCommand({
	meta: {
		name: "cxs-cloner",
		version: VERSION,
		description: "Clone Codex sessions with reduced context",
	},
	subCommands: {
		list: listCommand,
		info: infoCommand,
		clone: cloneCommand,
	},
	run({ rawArgs }) {
		// Only show help when no subcommand was given
		const subCommandNames = ["list", "info", "clone"];
		const hasSubCommand = rawArgs?.some((arg) => subCommandNames.includes(arg));
		if (!hasSubCommand) {
			console.log(HELP_TEXT);
		}
	},
});
