import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const cliPath = path.join(projectRoot, "dist", "src", "cli.js");
const fixturesDir = path.join(projectRoot, "fixtures");

test("CLI reads from stdin and reports stats on stderr", async () => {
  const raw = await readFile(path.join(fixturesDir, "chat-snippet-raw.txt"), "utf8");
  const expected = await readFile(path.join(fixturesDir, "chat-snippet-expected.txt"), "utf8");

  const result = spawnSync(process.execPath, [cliPath, "--stats"], {
    cwd: projectRoot,
    input: raw,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, expected);
  assert.match(result.stderr, /deterministic fixes:/);
  assert.match(result.stderr, /collapseBlankLines/);
});

test("CLI reads from a file and can write to an output file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "context-smoother-"));
  const outputPath = path.join(tempDir, "smoothed.txt");
  const expected = await readFile(path.join(fixturesDir, "ocr-note-expected.txt"), "utf8");

  const result = spawnSync(
    process.execPath,
    [cliPath, path.join(fixturesDir, "ocr-note-raw.txt"), "--output", outputPath, "--stats"],
    { cwd: projectRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /normalizeOcrArtifacts/);
  assert.equal(await readFile(outputPath, "utf8"), expected);
});

test("CLI shows help text", () => {
  const result = spawnSync(process.execPath, [cliPath, "--help"], {
    cwd: projectRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.equal(result.stderr, "");
});

test("CLI errors on too many positional input paths", () => {
  const result = spawnSync(process.execPath, [cliPath, "a.txt", "b.txt"], {
    cwd: projectRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Provide at most one positional input file/);
});

test("CLI errors on conflicting positional and flag-based input paths", () => {
  const result = spawnSync(
    process.execPath,
    [cliPath, path.join(fixturesDir, "ocr-note-raw.txt"), "--input", path.join(fixturesDir, "chat-snippet-raw.txt")],
    { cwd: projectRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Use either --input or a positional input file/);
});

test("CLI can emit stats as JSON for scripts", () => {
  const result = spawnSync(process.execPath, [cliPath, "--stats-format", "json"], {
    cwd: projectRoot,
    input: "hello ,i am here.",
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "Hello, I am here.");

  const parsed = JSON.parse(result.stderr) as {
    changed: boolean;
    totalFixes: number;
    fixCounts: Record<string, number>;
  };

  assert.equal(parsed.changed, true);
  assert.ok(parsed.totalFixes >= 2);
  assert.equal(parsed.fixCounts.removeSpaceBeforePunctuation, 1);
  assert.equal(parsed.fixCounts.normalizePronounCapitalization, 1);
});
