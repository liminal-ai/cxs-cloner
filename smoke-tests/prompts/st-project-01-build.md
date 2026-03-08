Build a bounded v1 TypeScript npm CLI project in this directory.

Project goal:
- Create a deterministic text smoothing CLI for cleaning human text before it is
  stored in long-lived LLM context.
- Input size target: up to 1 MB of text.
- The tool must improve mechanical readability without rewriting meaning.

Required behavior:
- Read input from a file path or stdin.
- Write output to stdout by default and optionally to an output file.
- Include an optional stats mode that reports what kinds of deterministic fixes
  were applied.
- Perform only deterministic cleanup:
  - spacing normalization
  - repeated whitespace cleanup
  - punctuation spacing fixes
  - line break cleanup
  - capitalization normalization where rule-based and safe
  - obvious OCR/human typo formatting artifacts only when deterministic
- Do not summarize, paraphrase, or stylistically rewrite the content.

Project requirements:
- TypeScript npm CLI project.
- No external services.
- Keep runtime dependencies minimal; zero runtime dependencies is preferred.
- Include:
  - package.json
  - tsconfig.json
  - src/
  - tests/
  - README.md
  - sample fixtures
  - npm scripts for build, test, and CLI execution
- Use clear internal structure and nontrivial test coverage.

Completion criteria:
- `npm run build` passes.
- `npm test` passes.
- README explains the purpose, deterministic guarantees, CLI usage, and example
  flows.
- Stop after the bounded v1 is complete and verified locally.
