Built the bounded v1 CLI in this directory as `context-smoother`: a zero-runtime-dependency TypeScript tool that reads from a file path or `stdin`, writes to `stdout` or an optional output file, and can emit deterministic per-rule stats on `stderr`. The core implementation is in [src/smoother.ts](/Users/leemoore/code/agent-cli-tools/cxs-cloner/smoke-tests/st-project-01/src/smoother.ts) and [src/cli.ts](/Users/leemoore/code/agent-cli-tools/cxs-cloner/smoke-tests/st-project-01/src/cli.ts). It applies only conservative, rule-based cleanup: whitespace normalization, punctuation spacing, blank-line cleanup, safe capitalization, and tightly bounded OCR-like `0`/`1` fixes.

I also replaced the scaffold docs with a real usage guide in [README.md](/Users/leemoore/code/agent-cli-tools/cxs-cloner/smoke-tests/st-project-01/README.md), added expected fixtures under [fixtures](/Users/leemoore/code/agent-cli-tools/cxs-cloner/smoke-tests/st-project-01/fixtures), and added unit plus CLI coverage in [tests/smoother.test.ts](/Users/leemoore/code/agent-cli-tools/cxs-cloner/smoke-tests/st-project-01/tests/smoother.test.ts) and [tests/cli.test.ts](/Users/leemoore/code/agent-cli-tools/cxs-cloner/smoke-tests/st-project-01/tests/cli.test.ts).

Verified locally:
- `npm run build`
- `npm test`

Both pass.