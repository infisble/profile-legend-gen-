function clampInt(value: unknown, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function safeString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

function normalizeText(value: unknown): string {
  return safeString(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueBy<T>(items: T[], selector: (item: T) => string): T[] {
  const seen = new Set();
  const output: T[] = [];

  for (const item of items) {
    const key = selector(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }

  return output;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object') {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object' && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }

  return value;
}

function deepClone<T>(value: T): T {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function hashString(value: unknown): number {
  const text = safeString(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function cyclePick<T>(items: T[], index: number): T | null {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  return items[index % items.length];
}

function splitSentences(text: unknown): string[] {
  return safeString(text)
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function generateNgrams(text: unknown, n = 4): string[] {
  const tokens = normalizeText(text)
    .split(' ')
    .map((item) => item.trim())
    .filter(Boolean);

  if (tokens.length < n) {
    return [];
  }

  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i += 1) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

module.exports = {
  clampInt,
  safeString,
  normalizeText,
  uniqueBy,
  deepFreeze,
  deepClone,
  hashString,
  cyclePick,
  splitSentences,
  generateNgrams
};
