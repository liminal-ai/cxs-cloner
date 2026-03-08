import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { FIX_KINDS, formatStats, smoothText } from "../src/smoother.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const fixturesDir = path.join(projectRoot, "fixtures");

test("smoothText applies deterministic cleanup to OCR-like prose", async () => {
  const raw = await readFixture("ocr-note-raw.txt");
  const expected = await readFixture("ocr-note-expected.txt");

  const result = smoothText(raw);

  assert.equal(result.text, expected);
  assert.equal(result.stats.changed, true);
  assert.equal(result.stats.fixCounts.normalizeOcrArtifacts, 1);
  assert.ok(result.stats.fixCounts.insertSpaceAfterPunctuation >= 1);
  assert.ok(result.stats.fixCounts.normalizeSentenceCapitalization >= 1);
});

test("smoothText preserves paragraph structure while cleaning chat-style text", async () => {
  const raw = await readFixture("chat-snippet-raw.txt");
  const expected = await readFixture("chat-snippet-expected.txt");

  const result = smoothText(raw);

  assert.equal(result.text, expected);
  assert.equal(result.stats.fixCounts.collapseBlankLines, 1);
  assert.equal(result.stats.fixCounts.normalizePronounCapitalization, 2);
});

test("smoothText leaves already clean text unchanged", () => {
  const input = "Already clean text.\n\nNo surprises here.";
  const result = smoothText(input);

  assert.equal(result.text, input);
  assert.equal(result.stats.changed, false);
  assert.equal(result.stats.totalFixes, 0);

  for (const kind of FIX_KINDS) {
    assert.equal(result.stats.fixCounts[kind], 0);
  }
});

test("sentence capitalization avoids common abbreviation false positives", () => {
  const input = "we met in the U.S. before lunch. then we left. e.g. this should stay lowercase.";
  const result = smoothText(input);

  assert.equal(
    result.text,
    "We met in the U.S. before lunch. Then we left. e.g. this should stay lowercase.",
  );
});

test("period spacing does not break decimals or ellipses", () => {
  const input = "version 3.14 is stable...really stable.";
  const result = smoothText(input);

  assert.equal(result.text, "Version 3.14 is stable...really stable.");
  assert.equal(result.stats.fixCounts.insertSpaceAfterPunctuation, 0);
});

test("smoothText preserves technical tokens while still fixing surrounding prose", () => {
  const input = "see example.com, config.json, src/smoother.ts, dev@example.com, and `i`. then reply.";
  const result = smoothText(input);

  assert.equal(
    result.text,
    "See example.com, config.json, src/smoother.ts, dev@example.com, and `i`. Then reply.",
  );
  assert.equal(result.stats.fixCounts.normalizePronounCapitalization, 0);
});

test("smoothText is idempotent on mixed technical text", () => {
  const input = "see example.com. then open config.json and tell me if i should check `i` first.";
  const once = smoothText(input);
  const twice = smoothText(once.text);

  assert.equal(
    once.text,
    "See example.com. Then open config.json and tell me if I should check `i` first.",
  );
  assert.equal(twice.text, once.text);
  assert.equal(twice.stats.changed, false);
});

test("smoothText handles punctuation-dense input at larger sizes", { timeout: 5_000 }, () => {
  const input = "alpha. beta.\n".repeat(10_000);
  const result = smoothText(input);

  assert.ok(result.text.startsWith("Alpha. Beta.\nAlpha. Beta.\n"));
  assert.match(result.text, /Beta\.\nAlpha\./);
});

test("formatStats reports only active fix kinds", () => {
  const result = smoothText("hello ,i am here.");
  const statsOutput = formatStats(result.stats);

  assert.match(statsOutput, /deterministic fixes:/);
  assert.match(statsOutput, /removeSpaceBeforePunctuation/);
  assert.match(statsOutput, /normalizePronounCapitalization/);
  assert.doesNotMatch(statsOutput, /collapseBlankLines: 0/);
});

async function readFixture(name: string): Promise<string> {
  return readFile(path.join(fixturesDir, name), "utf8");
}
