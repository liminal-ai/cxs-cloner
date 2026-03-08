# context-smoother

`context-smoother` is a bounded v1 TypeScript CLI for deterministic text cleanup
before human-written content is stored in long-lived LLM context.

It is designed for prose-like text up to about 1 MB and improves mechanical
readability without summarizing, paraphrasing, or stylistically rewriting the
content.

## Deterministic guarantees

This tool only applies rule-based cleanup. It does not call external services,
does not infer intent, and does not generate new semantic content.

The v1 rule set is intentionally conservative:

- normalize line endings and repeated whitespace
- trim trailing spaces and collapse excessive blank lines
- fix spacing before punctuation and insert missing spacing after punctuation
- normalize standalone `i` / `i'm` style pronouns to `I` / `I'm`
- capitalize sentence and paragraph starts when the boundary is rule-based
- repair a small set of obvious OCR-like `0` / `1` character swaps only when
  the corrected token matches a built-in safe-word allowlist
- protect inline code, URLs, email addresses, file-like dotted tokens, and
  slash-delimited paths from sentence and punctuation rewrites

Out of scope for v1:

- summarization, paraphrasing, tone changes, or stylistic rewriting
- grammar correction that requires interpretation
- broad typo correction or dictionary-driven rewriting
- code formatting, markdown reflow, or structure-aware document transforms

## Install and run

```bash
npm install
npm run build
```

Run from a file path:

```bash
npm run cli -- fixtures/ocr-note-raw.txt
```

Run from stdin:

```bash
cat fixtures/chat-snippet-raw.txt | npm run cli -- --stats
```

Emit machine-readable stats:

```bash
cat fixtures/chat-snippet-raw.txt | npm run cli -- --stats-format json
```

Write to a file:

```bash
npm run cli -- fixtures/ocr-note-raw.txt --output /tmp/ocr-note-clean.txt
```

## CLI usage

```text
context-smoother [input-file]
context-smoother --input <path> [--output <path>] [--stats] [--stats-format <text|json>]
cat input.txt | context-smoother [--output <path>] [--stats] [--stats-format <text|json>]
```

Options:

- `-i, --input <path>`: read input from a file path
- `-o, --output <path>`: write smoothed text to a file instead of stdout
- `--stats`: print deterministic fix stats to stderr
- `--stats-format <text|json>`: render stats as text or JSON and imply stats output
- `-h, --help`: show help text
- `-v, --version`: show the package version

`stdout` is reserved for smoothed text unless `--output` is used. Stats are
emitted on `stderr` so the text stream remains pipe-friendly. Passing both a
positional input path and `--input` is rejected to keep automation deterministic.

## Example

Input:

```text
th1s   paragraph came from a scan .it has odd   spacing,
line endings ,and   punctuation   placement !
```

Output:

```text
This paragraph came from a scan. It has odd spacing,
line endings, and punctuation placement!
```

## Project layout

- `src/smoother.ts`: deterministic normalization pipeline and stats formatter
- `src/text-boundaries.ts`: protected-span detection and shared sentence boundary rules
- `src/cli.ts`: CLI argument parsing and file/stdin I/O
- `tests/`: unit and CLI coverage
- `fixtures/`: sample raw and expected text files

## Verification

```bash
npm run build
npm test
```
