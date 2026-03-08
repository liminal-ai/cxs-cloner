#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { parseArgs } from "node:util";
import { formatStats, type SmoothingStats, smoothText } from "./smoother.js";

const HELP_TEXT = `Usage:
  context-smoother [input-file]
  context-smoother --input <path> [--output <path>] [--stats] [--stats-format <text|json>]
  cat input.txt | context-smoother [--output <path>] [--stats] [--stats-format <text|json>]

Options:
  -i, --input <path>    Read input from a file path.
  -o, --output <path>   Write smoothed text to a file instead of stdout.
      --stats           Print deterministic fix stats to stderr.
      --stats-format    Render stats as text or json. Implies stats output.
  -h, --help            Show this help text.
  -v, --version         Show the package version.
`;

type StatsFormat = "text" | "json";

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
      stats: { type: "boolean" },
      "stats-format": { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  if (values.version) {
    process.stdout.write("0.1.0\n");
    return;
  }

  if (positionals.length > 1) {
    throw new Error("Provide at most one positional input file.");
  }

  if (values.input && positionals[0]) {
    throw new Error("Use either --input or a positional input file, not both.");
  }

  const statsFormat = resolveStatsFormat(values.stats, values["stats-format"]);
  const inputPath = values.input ?? positionals[0];
  const inputText = inputPath ? await readFile(inputPath, "utf8") : await readStdin();

  if (!inputPath && process.stdin.isTTY && inputText.length === 0) {
    throw new Error("No input provided. Pass a file path or pipe text on stdin.");
  }

  const result = smoothText(inputText);

  if (values.output) {
    await writeFile(values.output, result.text, "utf8");
  } else {
    process.stdout.write(result.text);
  }

  if (statsFormat) {
    process.stderr.write(`${renderStats(result.stats, statsFormat)}\n`);
  }
}

async function readStdin(): Promise<string> {
  const chunks: string[] = [];

  process.stdin.setEncoding("utf8");

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return chunks.join("");
}

function resolveStatsFormat(showStats: boolean | undefined, rawFormat: string | undefined): StatsFormat | undefined {
  if (rawFormat === undefined) {
    return showStats ? "text" : undefined;
  }

  if (rawFormat === "text" || rawFormat === "json") {
    return rawFormat;
  }

  throw new Error('Stats format must be "text" or "json".');
}

function renderStats(stats: SmoothingStats, format: StatsFormat): string {
  if (format === "json") {
    return JSON.stringify(stats, null, 2);
  }

  return formatStats(stats);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
