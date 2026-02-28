# Story 6: Configuration and CLI Polish

## Objective

After this story ships, the tool supports layered configuration: defaults, config file (`cxs-cloner.config.ts` / `.json` / `rc`), environment variables (`CXS_CLONER_*`), and CLI flags — with CLI flags winning. The SDK exports are available for programmatic use. The clone command uses the full configuration pipeline instead of hardcoded defaults.

## Scope

### In Scope

- Layered configuration loading via c12 (defaults → config file → env vars → CLI flags)
- Zod schema validation for configuration
- Environment variable mapping (`CXS_CLONER_CODEX_DIR`, etc.)
- Config file support (`cxs-cloner.config.ts`, `.cxs-cloner.json`, `.cxs-clonerrc`)
- Custom presets and default preset override flowing from config file through to preset resolution
- Event preserve-list override flowing from config file through to record-stripper
- SDK barrel exports (`src/index.ts`) for all public types, presets, errors, and core functions
- Configured logger setup (`consola` with verbose/json modes)
- Replace hardcoded config construction in clone-command with full configuration-loader pipeline

### Out of Scope

- Core stripping algorithm changes (Story 4 — stable)
- Clone pipeline changes (Story 5 — stable, only config wiring changes)
- Compacted session preset calibration (Story 7)

## Dependencies / Prerequisites

- Story 5 must be complete (clone pipeline works with hardcoded defaults — this story replaces those with layered config)

## Acceptance Criteria

**AC-9.1:** The system SHALL support layered configuration (defaults → config file → env vars → CLI flags).

- **TC-9.1.1: Environment variable used when no CLI flag**
  - Given: `CXS_CLONER_CODEX_DIR=/custom/path` and no CLI flag
  - When: The tool runs
  - Then: `/custom/path` is used as the Codex directory
- **TC-9.1.2: CLI flag overrides environment variable**
  - Given: Both `CXS_CLONER_CODEX_DIR=/env/path` and `--codex-dir /cli/path`
  - When: The tool runs
  - Then: `/cli/path` is used (CLI flag wins)

## Config-to-Stripper Integration

This story owns the seam between configuration loading (Story 6) and the stripping engine (Story 4). The config-loader must correctly pass `customPresets`, `defaultPreset`, and `eventPreserveList` from the loaded config through to the `ResolvedCloneConfig` that the clone pipeline consumes. Verification:

- Custom presets from config file are available to `resolvePreset()` when the clone command runs
- `defaultPreset` from config file is used when `--strip-tools` is provided without a preset name
- `eventPreserveList` from config file augments the built-in preserve list passed to `stripRecords()`

These are integration verification points, not epic TCs — they validate that the config-loader-to-stripper wiring works end-to-end.

## Error Paths

| Scenario | Expected Response |
|----------|------------------|
| Config file with invalid schema | `ConfigurationError` with zod validation details |
| Config file not found | Use defaults silently (no error) |
| Invalid environment variable value | `ConfigurationError` with field and reason |

## Definition of Done

- [ ] All ACs met
- [ ] All TC conditions verified
- [ ] Config files in `.ts`, `.json`, and `rc` formats all work
- [ ] Environment variables correctly override defaults
- [ ] CLI flags correctly override environment variables
- [ ] Custom presets from config files flow through to preset resolution
- [ ] Event preserve-list from config files flows through to record-stripper
- [ ] SDK imports (`import { ... } from "cxs-cloner"`) work
- [ ] Clone command uses full configuration pipeline
- [ ] PO accepts

---

## Technical Implementation

### Architecture Context

This story implements the layered configuration system and finishes the CLI polish. It replaces the hardcoded config construction in `clone-command` (from Story 5) with the full c12/zod configuration pipeline. It also adds the SDK barrel exports for programmatic use.

**Modules and Responsibilities:**

| Module | Path | Responsibility | AC Coverage |
|--------|------|----------------|-------------|
| `configuration-loader` | `src/config/configuration-loader.ts` | Load config via c12 (file, env, defaults), validate with zod, merge with CLI flags | AC-9.1 |
| `configuration-schema` | `src/config/configuration-schema.ts` | Zod schema matching `CxsConfiguration` interface | AC-9.1 |
| `default-configuration` | `src/config/default-configuration.ts` | Built-in defaults and env var mapping | AC-9.1 |
| `index.ts` (SDK) | `src/index.ts` | Barrel exports for all public types, presets, errors, core functions | (SDK) |
| `configured-logger` | `src/output/configured-logger.ts` | consola setup with verbose/json modes | (logging) |

**Configuration Layer Precedence (from Tech Design §Module Responsibility Matrix):**

```
Lowest priority                              Highest priority
     │                                            │
     ▼                                            ▼
  Defaults ──→ Config file ──→ Env vars ──→ CLI flags
  (built-in)   (.config.ts     (CXS_CLONER_*)  (--codex-dir,
                .json, rc)                       --strip-tools, etc.)
```

The configuration loader uses c12 for file-based config loading. c12 supports multiple config file formats: `cxs-cloner.config.ts`, `.cxs-cloner.json`, `.cxs-clonerrc`. It automatically discovers and loads config files from the current directory and parent directories.

After c12 loads the file config, the loader:
1. Merges with built-in defaults (for any missing fields)
2. Applies environment variable overrides (`CXS_CLONER_CODEX_DIR`, etc.)
3. Validates the merged result with zod
4. Returns the validated `CxsConfiguration`

The `clone-command` then merges CLI flags on top of the loaded configuration to produce `ResolvedCloneConfig`.

**Config-to-Stripper Integration (the critical wiring):**

This story owns the seam between configuration loading and the stripping engine. The following data must flow correctly:

1. **Custom presets** from config file → available to `resolvePreset()` when clone runs
2. **Default preset** from config file → used when `--strip-tools` provided without preset name
3. **Event preserve-list** from config file → augments built-in preserve list → passed to `stripRecords()` via `StripConfig.eventPreserveList`
4. **Truncate length** from config file → passed to `stripRecords()` via `StripConfig.truncateLength`

**Environment Variable Mapping:**

| Env Var | Config Field | Type |
|---------|-------------|------|
| `CXS_CLONER_CODEX_DIR` | `codexDir` | string |

Additional env vars may be added as needed, following the `CXS_CLONER_` prefix convention.

**SDK Barrel Exports (`src/index.ts`):**

The SDK exports enable programmatic use of cxs-cloner's core functionality:
- All public types from `src/types/`
- Error classes from `src/errors/`
- Preset constants and resolution functions from `src/config/tool-removal-presets.ts`
- Core functions: `identifyTurns`, `stripRecords`, `executeCloneOperation`
- IO functions: `scanSessionDirectory`, `findSessionByPartialId`, `parseSessionFile`, `writeClonedSession`

### Interfaces & Contracts

**Creates:**

```typescript
// src/config/configuration-loader.ts
import type { CxsConfiguration } from "../types/configuration-types.js";

/**
 * Load configuration from all layers.
 * Precedence: defaults → config file → env vars → CLI flags (CLI flags applied by caller).
 *
 * @param overrides - CLI flag overrides to merge on top
 * @returns Validated CxsConfiguration
 * @throws ConfigurationError if config file has invalid schema
 */
export async function loadConfiguration(
  overrides?: Partial<CxsConfiguration>,
): Promise<CxsConfiguration>;

// src/config/configuration-schema.ts
import { z } from "zod";

/**
 * Zod schema for CxsConfiguration.
 * Validates all fields with appropriate constraints.
 */
export const cxsConfigurationSchema: z.ZodSchema<CxsConfiguration>;

// src/config/default-configuration.ts
import type { CxsConfiguration } from "../types/configuration-types.js";

/**
 * Built-in default configuration.
 */
export const DEFAULT_CONFIGURATION: CxsConfiguration;

/**
 * Environment variable mapping for c12.
 */
export const ENV_VAR_MAP: Record<string, string>;

// src/index.ts — SDK barrel exports
export {
  // Types
  type RolloutLine, type RolloutType, type RolloutPayload,
  type SessionMetaPayload, type ResponseItemPayload,
  // ... all public types

  // Errors
  CxsError, SessionNotFoundError, AmbiguousMatchError,
  MalformedJsonError, ConfigurationError,
  // ... all error classes

  // Constants
  BUILT_IN_PRESETS, DEFAULT_TRUNCATE_LENGTH,
  DEFAULT_EVENT_PRESERVE_LIST, TURN_CONTEXT_STRUCTURAL_FIELDS,

  // Functions
  resolvePreset, identifyTurns, stripRecords,
  executeCloneOperation, scanSessionDirectory,
  findSessionByPartialId, parseSessionFile, writeClonedSession,
  loadConfiguration,
} from "./...";

// src/output/configured-logger.ts
import { consola } from "consola";

/**
 * Create configured logger instance.
 * Respects verbose and json mode settings.
 */
export function createLogger(options: { verbose: boolean; json: boolean }): typeof consola;
```

**Consumes (from Story 0):**

```typescript
// src/types/configuration-types.ts
export interface CxsConfiguration {
  codexDir: string;
  defaultPreset: string;
  customPresets: Record<string, ToolRemovalPreset>;
  eventPreserveList: string[];
  truncateLength: number;
}

// src/errors/clone-operation-errors.ts
export class ConfigurationError extends CxsError { ... }
```

**Modifies (from Story 5):**

```typescript
// src/commands/clone-command.ts
// BEFORE (Story 5): Constructs ResolvedCloneConfig from CLI flags + hardcoded defaults
// AFTER (Story 6): Uses loadConfiguration() + CLI flag merge to construct ResolvedCloneConfig
// The clone-command now calls loadConfiguration() first, then merges CLI flags on top
```

### TC -> Test Mapping

| TC | Test File | Test Description | Approach |
|----|-----------|------------------|----------|
| TC-9.1.1 | `test/config/configuration-loader.test.ts` | TC-9.1.1: env var used when no CLI flag | Set `CXS_CLONER_CODEX_DIR=/custom/path` in process.env. Call `loadConfiguration()` with no overrides. Assert `codexDir === "/custom/path"`. Clean up env var after test. |
| TC-9.1.2 | `test/config/configuration-loader.test.ts` | TC-9.1.2: CLI flag overrides env var | Set `CXS_CLONER_CODEX_DIR=/env/path`. Call `loadConfiguration({ codexDir: "/cli/path" })`. Assert `codexDir === "/cli/path"`. |

### Non-TC Decided Tests

| Test File | Test Description | Source |
|-----------|------------------|--------|
| `test/config/configuration-loader.test.ts` | Config file with invalid schema throws ConfigurationError with zod details | Tech Design §Chunk 6 Non-TC Decided Tests |
| `test/config/configuration-loader.test.ts` | Missing config file uses defaults silently (no error) | Tech Design §Chunk 6 Non-TC Decided Tests |
| `test/config/configuration-loader.test.ts` | Multiple config file formats (.ts, .json, rc) all load correctly | Tech Design §Chunk 6 Non-TC Decided Tests |
| `test/config/configuration-loader.test.ts` | Custom preset passthrough: custom presets from config file available to resolvePreset | Tech Design §Chunk 6 Non-TC Decided Tests |

### Risks & Constraints

- **c12 behavior:** c12 searches for config files up the directory tree. In test environments, this could accidentally pick up a real config file from a parent directory. Tests should use isolated temp directories or explicit config paths to avoid this.
- **Zod validation strictness:** The zod schema should use `.passthrough()` or `.strip()` appropriately. Unknown fields in config files should be ignored (not error), following c12's convention.
- **Config-to-stripper wiring:** The critical integration point. If `customPresets` from the config don't flow through to `resolvePreset()`, custom presets silently fail. If `eventPreserveList` from config doesn't reach `StripConfig`, custom event preservation silently fails. The non-TC integration tests validate these pathways.
- **Clone-command modification:** Replacing the hardcoded config construction in `clone-command` with `loadConfiguration()` changes Story 5's code. Must not break existing clone command behavior — regression testing is essential.
- **SDK exports correctness:** The barrel exports must re-export the correct names. Missing or incorrect exports silently fail until consumers try to import them. Validate with a quick import test.

### Spec Deviation

None. Checked against Tech Design: §Low Altitude — CxsConfiguration interface, §Low Altitude — configuration-loader entry point, §Module Responsibility Matrix (configuration-loader row), §Chunk 6 scope and TC mapping, §Component Interaction Diagram (config flow note about Story 5 vs Story 6).

## Technical Checklist

- [ ] All TCs have passing tests (2 TCs)
- [ ] Non-TC decided tests pass (4 tests)
- [ ] Config file loading works in .ts, .json, and rc formats
- [ ] Environment variables correctly override defaults
- [ ] CLI flags correctly override environment variables
- [ ] Custom presets from config flow through to preset resolution
- [ ] Event preserve-list from config flows through to record-stripper
- [ ] SDK imports work (`import { ... } from "cxs-cloner"`)
- [ ] Clone command uses full configuration pipeline (no more hardcoded defaults)
- [ ] TypeScript compiles clean (`bun run typecheck`)
- [ ] Lint/format passes (`bun run format:check && bun run lint`)
- [ ] No regressions on Stories 0-5 (`bun test`)
- [ ] Verification: `bun run verify`
- [ ] Spec deviations documented (if any)
