/** Types for the embed bundler, so tests can build before they serve it. */
export declare const EMBED_BUDGET_BYTES: number;
export declare function buildEmbed(options?: {
  outfile?: string;
  origin?: string;
}): Promise<{ outfile: string; size: number }>;
