import type { TranscriptWordResult } from "@/lib/providers/types";
import { normalizeToken, withTrailingPunctuation } from "@/lib/edit-state";

/**
 * The glossary, applied.
 *
 * Three jobs, each done where it belongs: the terms prime the transcriber
 * (`keytermsFor`), what still comes back wrong is corrected before the
 * transcript is segmented (`applyGlossary`), and a term whose spelling is
 * not how it is said gives the narrator a respelling (`pronunciationsFor`).
 */

export interface GlossaryTerm {
  heard: string;
  text: string;
  spoken: string | null;
}

/** Deepgram takes up to about fifty terms per request before recall stops improving. */
const MAX_KEYTERMS = 50;

/** The spellings to prime the transcriber with: what the workspace wants to see. */
export function keytermsFor(terms: GlossaryTerm[]): string[] {
  const unique = new Set<string>();
  for (const term of terms) {
    const text = term.text.trim();
    if (text) unique.add(text);
  }
  return [...unique].slice(0, MAX_KEYTERMS);
}

/** The respellings a narrator reads: shown text → how it is said. */
export function pronunciationsFor(terms: GlossaryTerm[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const term of terms) {
    const text = term.text.trim().replace(/[.,!?;:]+$/, "");
    const spoken = term.spoken?.trim();
    if (text && spoken && spoken !== text) out[text] = spoken;
  }
  return out;
}

/**
 * Corrects a transcript by the glossary before anything reads it.
 *
 * A matched run of words becomes one word carrying the workspace's spelling
 * and the run's whole span of time, with the transcriber's trailing
 * punctuation kept. Matching is on normalized tokens, so "Core," matches a
 * term heard as "core". Longer terms are tried first so "c l o" is not
 * partly eaten by a term for "c".
 */
export function applyGlossary(
  words: TranscriptWordResult[],
  terms: GlossaryTerm[],
): { words: TranscriptWordResult[]; corrections: number } {
  const rules = terms
    .map((term) => ({
      tokens: term.heard.split(/\s+/).map(normalizeToken).filter(Boolean),
      text: term.text.trim(),
    }))
    .filter((rule) => rule.tokens.length > 0 && rule.text)
    .sort((a, b) => b.tokens.length - a.tokens.length);
  if (rules.length === 0) return { words, corrections: 0 };

  const normalized = words.map((w) => normalizeToken(w.word));
  const out: TranscriptWordResult[] = [];
  let corrections = 0;
  for (let i = 0; i < words.length; ) {
    const rule = rules.find((r) => r.tokens.every((token, k) => normalized[i + k] === token));
    if (!rule) {
      out.push(words[i]);
      i += 1;
      continue;
    }
    const run = words.slice(i, i + rule.tokens.length);
    const last = run[run.length - 1];
    out.push({
      word: withTrailingPunctuation(rule.text, last.word),
      start: run[0].start,
      end: last.end,
      confidence: Math.min(...run.map((w) => w.confidence)),
      ...(run[0].speaker ? { speaker: run[0].speaker } : {}),
    });
    corrections += 1;
    i += rule.tokens.length;
  }
  return { words: out, corrections };
}
