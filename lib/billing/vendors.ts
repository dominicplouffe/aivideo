/**
 * The vendors a workspace can bring its own keys for. Pure, so the Settings
 * form can import it without dragging the database client into the browser.
 */
export const VENDORS = ["deepgram", "elevenlabs", "anthropic"] as const;
export type Vendor = (typeof VENDORS)[number];

export const VENDOR_LABELS: Record<Vendor, { name: string; used: string; where: string }> = {
  deepgram: { name: "Deepgram", used: "Transcription of every recording", where: "console.deepgram.com → API keys" },
  elevenlabs: { name: "ElevenLabs", used: "AI voices and narration", where: "elevenlabs.io → Profile → API keys" },
  anthropic: { name: "Anthropic", used: "Riff, suggested cuts, guides and the agent", where: "console.anthropic.com → API keys" },
};
