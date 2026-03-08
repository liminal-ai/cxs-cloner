import {
  classifyPeriod,
  collectProtectedSpans,
  intersectsProtectedSpan,
  isIndexProtected,
  startsWithLowercaseAbbreviation,
} from "./text-boundaries.js";

export const FIX_KINDS = [
  "normalizeLineEndings",
  "normalizeSpecialSpaces",
  "removeControlCharacters",
  "trimTrailingWhitespace",
  "collapseInlineWhitespace",
  "collapseBlankLines",
  "removeSpaceBeforePunctuation",
  "removeSpaceAfterOpeners",
  "insertSpaceAfterPunctuation",
  "normalizePronounCapitalization",
  "normalizeSentenceCapitalization",
  "normalizeOcrArtifacts",
] as const;

export type FixKind = (typeof FIX_KINDS)[number];

export interface SmoothingStats {
  readonly inputLength: number;
  outputLength: number;
  totalFixes: number;
  changed: boolean;
  fixCounts: Record<FixKind, number>;
}

export interface SmoothingResult {
  text: string;
  stats: SmoothingStats;
}

const SPECIAL_SPACE_REGEX = /[\t\f\v\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;
const CONTROL_CHARACTER_REGEX = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const OCR_SAFE_WORDS = new Set([
  "a",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "can",
  "did",
  "do",
  "for",
  "from",
  "has",
  "have",
  "he",
  "her",
  "him",
  "his",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "line",
  "more",
  "not",
  "of",
  "on",
  "or",
  "our",
  "paragraph",
  "scan",
  "she",
  "so",
  "text",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "want",
  "was",
  "we",
  "were",
  "with",
  "you",
  "your",
]);

export function smoothText(input: string): SmoothingResult {
  const stats = createEmptyStats(input.length);
  let text = input;

  text = replaceAll(text, /\r\n?/g, "\n", stats, "normalizeLineEndings");
  text = replaceAll(text, SPECIAL_SPACE_REGEX, " ", stats, "normalizeSpecialSpaces");
  text = replaceAll(text, CONTROL_CHARACTER_REGEX, "", stats, "removeControlCharacters");
  text = replaceAll(text, /[ ]+$/gm, "", stats, "trimTrailingWhitespace");
  text = replaceAll(text, / {2,}/g, " ", stats, "collapseInlineWhitespace");
  text = replaceAll(text, /\n{3,}/g, "\n\n", stats, "collapseBlankLines");
  text = replaceAll(text, / +([,.;:!?)\]}\u201d])/g, "$1", stats, "removeSpaceBeforePunctuation");
  text = replaceAll(text, /([([{]) +/g, "$1", stats, "removeSpaceAfterOpeners");
  text = insertSpacingAfterPunctuation(text, stats);
  text = normalizeOcrArtifacts(text, stats);
  text = normalizePronounCapitalization(text, stats);
  text = normalizeSentenceCapitalization(text, stats);

  stats.outputLength = text.length;
  stats.changed = text !== input;

  return { text, stats };
}

export function formatStats(stats: SmoothingStats): string {
  const activeKinds = FIX_KINDS.filter((kind) => stats.fixCounts[kind] > 0);
  const lines = [
    `deterministic fixes: ${stats.totalFixes}`,
    `input chars: ${stats.inputLength}`,
    `output chars: ${stats.outputLength}`,
    `changed: ${stats.changed ? "yes" : "no"}`,
  ];

  if (activeKinds.length === 0) {
    lines.push("applied kinds: none");
    return lines.join("\n");
  }

  lines.push("applied kinds:");

  for (const kind of activeKinds) {
    lines.push(`- ${kind}: ${stats.fixCounts[kind]}`);
  }

  return lines.join("\n");
}

function createEmptyStats(inputLength: number): SmoothingStats {
  const fixCounts = Object.fromEntries(FIX_KINDS.map((kind) => [kind, 0])) as Record<
    FixKind,
    number
  >;

  return {
    inputLength,
    outputLength: inputLength,
    totalFixes: 0,
    changed: false,
    fixCounts,
  };
}

function increment(stats: SmoothingStats, kind: FixKind, amount = 1): void {
  if (amount <= 0) {
    return;
  }

  stats.fixCounts[kind] += amount;
  stats.totalFixes += amount;
}

function replaceAll(
  text: string,
  pattern: RegExp,
  replacement: string,
  stats: SmoothingStats,
  kind: FixKind,
): string {
  let replacements = 0;
  const next = text.replace(pattern, (...args) => {
    replacements += 1;
    const match = args[0] as string;
    return typeof replacement === "string" ? expandReplacement(match, args, replacement) : replacement;
  });
  increment(stats, kind, replacements);
  return next;
}

function expandReplacement(match: string, args: unknown[], replacement: string): string {
  if (!replacement.includes("$")) {
    return replacement;
  }

  let expanded = replacement.replace(/\$&/g, match);

  for (let index = 1; index < args.length - 2; index += 1) {
    expanded = expanded.replaceAll(`$${index}`, String(args[index] ?? ""));
  }

  return expanded;
}

function insertSpacingAfterPunctuation(text: string, stats: SmoothingStats): string {
  const punctuationProtectedSpans = collectProtectedSpans(text);
  let replacements = 0;

  const next = text.replace(/([,;:!?])(?=[^\s)\]}>"'\u201d])/g, (match, punctuation, offset, source) => {
    const index = Number(offset);

    if (
      isIndexProtected(punctuationProtectedSpans, index) ||
      !shouldInsertSpaceAfterPunctuation(String(source), index, String(punctuation))
    ) {
      return match;
    }

    replacements += 1;
    return `${punctuation} `;
  });

  const periodProtectedSpans = collectProtectedSpans(next);
  const withPeriods = next.replace(
    /(?<!\.)\.(?!\.)(?=[A-Za-z("'\u2018\u201c])/g,
    (match, offset, source) => {
      const index = Number(offset);

      if (!classifyPeriod(String(source), index, periodProtectedSpans).isBoundary) {
        return match;
      }

      replacements += 1;
      return ". ";
    },
  );

  increment(stats, "insertSpaceAfterPunctuation", replacements);
  return withPeriods;
}

function normalizePronounCapitalization(text: string, stats: SmoothingStats): string {
  const protectedSpans = collectProtectedSpans(text);
  let replacements = 0;

  const next = text.replace(/\bi(?:(['\u2019](?:m|d|ll|ve|re|s))\b)?\b/g, (match, _suffix, offset) => {
    const start = Number(offset);

    if (intersectsProtectedSpan(protectedSpans, start, start + match.length)) {
      return match;
    }

    if (!match.startsWith("i")) {
      return match;
    }

    replacements += 1;
    return `I${match.slice(1)}`;
  });

  increment(stats, "normalizePronounCapitalization", replacements);
  return next;
}

function normalizeOcrArtifacts(text: string, stats: SmoothingStats): string {
  const protectedSpans = collectProtectedSpans(text);
  let replacements = 0;

  const next = text.replace(/\b[0-9A-Za-z']+\b/g, (token, offset) => {
    const start = Number(offset);

    if (intersectsProtectedSpan(protectedSpans, start, start + token.length)) {
      return token;
    }

    if (!/[01]/.test(token) || /[^0-9A-Za-z']/g.test(token)) {
      return token;
    }

    if (!/[A-Za-z]/.test(token) || /\d.*\d/.test(token)) {
      return token;
    }

    const lower = token.toLowerCase();
    const candidate = lower.replaceAll("0", "o").replaceAll("1", "i");

    if (!OCR_SAFE_WORDS.has(candidate) || candidate === lower) {
      return token;
    }

    replacements += 1;
    return matchCase(candidate, token);
  });

  increment(stats, "normalizeOcrArtifacts", replacements);
  return next;
}

function normalizeSentenceCapitalization(text: string, stats: SmoothingStats): string {
  const characters = [...text];
  const protectedSpans = collectProtectedSpans(text);
  let pendingSentenceStart = true;
  let replacements = 0;

  for (let index = 0; index < characters.length; index += 1) {
    const current = characters[index] ?? "";

    if (pendingSentenceStart) {
      if (current === "" || /\s/.test(current) || /["'\u2018\u2019\u201c\u201d)\]}]/.test(current)) {
        continue;
      }

      if (isIndexProtected(protectedSpans, index)) {
        pendingSentenceStart = false;
        continue;
      }

      if (startsWithLowercaseAbbreviation(text, index)) {
        pendingSentenceStart = false;
        continue;
      }

      if (/[a-z]/.test(current)) {
        characters[index] = current.toUpperCase();
        replacements += 1;
      }

      pendingSentenceStart = false;
      continue;
    }

    if (current === "\n" && characters[index + 1] === "\n") {
      pendingSentenceStart = true;
      continue;
    }

    if (current === "!" || current === "?") {
      pendingSentenceStart = true;
      continue;
    }

    if (current === "." && classifyPeriod(text, index, protectedSpans).isBoundary) {
      pendingSentenceStart = true;
    }
  }

  increment(stats, "normalizeSentenceCapitalization", replacements);
  return characters.join("");
}

function matchCase(candidate: string, source: string): string {
  if (source === source.toUpperCase()) {
    return candidate.toUpperCase();
  }

  if ((source[0] ?? "") === (source[0] ?? "").toUpperCase()) {
    const firstCharacter = candidate[0];
    return firstCharacter ? firstCharacter.toUpperCase() + candidate.slice(1) : candidate;
  }

  return candidate;
}

function shouldInsertSpaceAfterPunctuation(text: string, index: number, punctuation: string): boolean {
  const previous = text[index - 1] ?? "";
  const next = text[index + 1] ?? "";

  if ((punctuation === "," || punctuation === ":") && /\d/.test(previous) && /\d/.test(next)) {
    return false;
  }

  return true;
}
