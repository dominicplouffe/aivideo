// Not `server-only`: the render worker reads the glossary from a plain
// Node process, where that guard would throw.
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import * as s from "../schema";
import { normalizeToken } from "@/lib/edit-state";

/**
 * A workspace's glossary: the words it spells its own way. See the table's
 * note in the schema for how the terms are applied.
 */

export interface GlossaryEntry {
  id: string;
  heard: string;
  text: string;
  spoken: string | null;
  updatedAt: string;
}

function toEntry(row: typeof s.glossaryTerms.$inferSelect): GlossaryEntry {
  return { id: row.id, heard: row.heard, text: row.text, spoken: row.spoken, updatedAt: row.updatedAt.toISOString() };
}

/** The key a term is matched on: its heard form, normalized token by token. */
export function heardKeyOf(heard: string): string {
  return heard.split(/\s+/).map(normalizeToken).filter(Boolean).join(" ");
}

export async function listGlossary(workspaceId: string): Promise<GlossaryEntry[]> {
  const rows = await getDb()
    .select()
    .from(s.glossaryTerms)
    .where(eq(s.glossaryTerms.workspaceId, workspaceId))
    .orderBy(asc(s.glossaryTerms.heardKey));
  return rows.map(toEntry);
}

/** Adds a term, or replaces the one already keyed on the same heard form. */
export async function upsertGlossaryTerm(
  workspaceId: string,
  input: { heard: string; text: string; spoken: string | null; createdBy: string | null },
): Promise<GlossaryEntry | null> {
  const heardKey = heardKeyOf(input.heard);
  if (!heardKey) return null;
  const values = {
    heard: input.heard.trim(),
    heardKey,
    text: input.text.trim(),
    spoken: input.spoken?.trim() || null,
    updatedAt: new Date(),
  };
  const [row] = await getDb()
    .insert(s.glossaryTerms)
    .values({ ...values, workspaceId, createdBy: input.createdBy })
    .onConflictDoUpdate({
      target: [s.glossaryTerms.workspaceId, s.glossaryTerms.heardKey],
      set: values,
    })
    .returning();
  return row ? toEntry(row) : null;
}

export async function removeGlossaryTerm(workspaceId: string, id: string): Promise<boolean> {
  const [row] = await getDb()
    .delete(s.glossaryTerms)
    .where(and(eq(s.glossaryTerms.workspaceId, workspaceId), eq(s.glossaryTerms.id, id)))
    .returning({ id: s.glossaryTerms.id });
  return Boolean(row);
}
