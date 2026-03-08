export interface ProtectedSpan {
  readonly start: number;
  readonly end: number;
}

export interface PeriodClassification {
  readonly isBoundary: boolean;
}

const COMMON_ABBREVIATIONS = [
  "e.g.",
  "i.e.",
  "etc.",
  "mr.",
  "mrs.",
  "ms.",
  "dr.",
  "prof.",
  "sr.",
  "jr.",
  "vs.",
] as const;

const INLINE_CODE_REGEX = /`[^`\n]+`/g;
const URL_REGEX = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/g;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const DOTTED_TOKEN_REGEX = /\b[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+\b/g;
const PATH_TOKEN_REGEX = /(?:\.{1,2}\/)?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+/g;
const PROTECTED_DOTTED_SUFFIXES = new Set([
  "ai",
  "app",
  "cjs",
  "com",
  "css",
  "csv",
  "dev",
  "edu",
  "gov",
  "html",
  "ini",
  "io",
  "js",
  "json",
  "jsx",
  "lock",
  "log",
  "md",
  "mjs",
  "net",
  "org",
  "pdf",
  "sh",
  "text",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

export function collectProtectedSpans(text: string): ProtectedSpan[] {
  const spans = [
    ...collectMatches(text, INLINE_CODE_REGEX),
    ...collectMatches(text, URL_REGEX, trimTrailingSentencePunctuation),
    ...collectMatches(text, EMAIL_REGEX),
    ...collectMatches(text, PATH_TOKEN_REGEX),
    ...collectMatches(text, DOTTED_TOKEN_REGEX, undefined, isProtectedDottedToken),
  ].filter((span) => span.end > span.start);

  spans.sort((left, right) => left.start - right.start || left.end - right.end);

  const merged: ProtectedSpan[] = [];

  for (const span of spans) {
    const previous = merged.at(-1);

    if (!previous || span.start > previous.end) {
      merged.push(span);
      continue;
    }

    merged[merged.length - 1] = {
      start: previous.start,
      end: Math.max(previous.end, span.end),
    };
  }

  return merged;
}

export function intersectsProtectedSpan(
  spans: readonly ProtectedSpan[],
  start: number,
  end: number,
): boolean {
  if (start >= end || spans.length === 0) {
    return false;
  }

  const candidateIndex = findLastSpanStartingBefore(spans, end - 1);

  if (candidateIndex < 0) {
    return false;
  }

  const candidate = spans[candidateIndex];
  return candidate !== undefined && candidate.end > start;
}

export function isIndexProtected(spans: readonly ProtectedSpan[], index: number): boolean {
  if (index < 0 || spans.length === 0) {
    return false;
  }

  const candidateIndex = findLastSpanStartingBefore(spans, index);

  if (candidateIndex < 0) {
    return false;
  }

  const candidate = spans[candidateIndex];
  return candidate !== undefined && candidate.end > index;
}

export function classifyPeriod(text: string, index: number, spans: readonly ProtectedSpan[]): PeriodClassification {
  if (isIndexProtected(spans, index)) {
    return { isBoundary: false };
  }

  const previous = text[index - 1] ?? "";
  const next = text[index + 1] ?? "";

  if (previous === "." || next === ".") {
    return { isBoundary: false };
  }

  if (/\d/.test(previous) && /\d/.test(next)) {
    return { isBoundary: false };
  }

  const previousToken = readAsciiLettersBackward(text, index - 1);

  if (previousToken.length === 1 && /[A-Za-z]/.test(next)) {
    return { isBoundary: false };
  }

  const precedingSegment = text.slice(Math.max(0, index - 16), index + 1);
  const normalizedSegment = precedingSegment.toLowerCase();

  if (COMMON_ABBREVIATIONS.some((abbreviation) => normalizedSegment.endsWith(abbreviation))) {
    return { isBoundary: false };
  }

  if (/(?:\b[A-Z]\.){2,}$/.test(precedingSegment)) {
    return { isBoundary: false };
  }

  return { isBoundary: true };
}

export function startsWithLowercaseAbbreviation(text: string, index: number): boolean {
  const segment = text.slice(index, index + 5).toLowerCase();
  return segment.startsWith("e.g.") || segment.startsWith("i.e.");
}

function collectMatches(
  text: string,
  pattern: RegExp,
  trimMatch: ((value: string) => number) | undefined = undefined,
  includeMatch: ((value: string) => boolean) | undefined = undefined,
): ProtectedSpan[] {
  const spans: ProtectedSpan[] = [];

  for (const match of text.matchAll(pattern)) {
    const value = match[0];
    const start = match.index ?? -1;

    if (start < 0 || value.length === 0) {
      continue;
    }

    if (includeMatch && !includeMatch(value)) {
      continue;
    }

    const endOffset = trimMatch ? trimMatch(value) : value.length;

    if (endOffset <= 0) {
      continue;
    }

    spans.push({
      start,
      end: start + endOffset,
    });
  }

  return spans;
}

function trimTrailingSentencePunctuation(value: string): number {
  let end = value.length;

  while (end > 0 && /[.,!?;:]/.test(value[end - 1] ?? "")) {
    end -= 1;
  }

  return end;
}

function isProtectedDottedToken(value: string): boolean {
  const suffix = value.split(".").at(-1)?.toLowerCase() ?? "";
  return PROTECTED_DOTTED_SUFFIXES.has(suffix);
}

function readAsciiLettersBackward(text: string, index: number): string {
  let start = index;

  while (start >= 0 && /[A-Za-z]/.test(text[start] ?? "")) {
    start -= 1;
  }

  return text.slice(start + 1, index + 1);
}

function findLastSpanStartingBefore(spans: readonly ProtectedSpan[], index: number): number {
  let low = 0;
  let high = spans.length - 1;
  let result = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = spans[middle];

    if (!candidate) {
      break;
    }

    if (candidate.start <= index) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
}
