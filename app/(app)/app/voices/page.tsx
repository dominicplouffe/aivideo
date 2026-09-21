import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/app/Shared";
import { Icon } from "@/components/ui/Icon";
import { voices } from "@/lib/app-data";
import { VoiceClones } from "@/components/app/VoiceClones";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Voices" };

export default function VoicesPage() {
  const studio = voices.filter((v) => v.kind === "studio");

  return (
    <>
      <PageHeader
        title="Voices"
        description="Studio voices for product narration, plus clones of your own team. Synthesis is what turns a written script into either; without a provider configured, a video carries the voice on the recording."
      />

      <div className="space-y-4 px-4 py-6 md:px-8">
        <Panel
          title="Your clones"
          description="Consent recorded and revocable by the person cloned"
        >
          <VoiceClones />

          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] bg-ink-900 px-5 py-4">
            <Icon name="shield" className="size-4 shrink-0 text-mint-400" strokeWidth={1.9} />
            <p className="min-w-0 flex-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
              Creating a clone requires a spoken consent phrase containing the date and workspace
              name. The person cloned can revoke at any time, which disables the voice for all
              future renders immediately.
            </p>
          </div>
        </Panel>

        <Panel title="Studio library" description="Licensed for unlimited commercial use, worldwide">
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
            {studio.map((v) => (
              <div
                key={v.id}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border p-4 transition-colors hover:border-[var(--line-strong)]",
                  v.favourite ? "border-iris-500/35 bg-iris-500/[0.06]" : "border-[var(--line)]",
                )}
              >
                <div className="flex items-start justify-between">
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-iris-600),var(--color-violet-500))]">
                    <Icon name="play" className="size-3.5 text-white" />
                  </span>
                  <Icon
                    name="star"
                    className={cn("size-4", v.favourite ? "text-amber-400" : "text-fg-faint")}
                  />
                </div>
                <div>
                  <p className="text-[0.875rem] font-medium text-fg-strong">
                    {v.name} <span className="font-mono text-2xs text-fg-faint">{v.accent}</span>
                  </p>
                  <p className="mt-0.5 text-[0.75rem] leading-snug text-fg-subtle">{v.descriptor}</p>
                </div>
              </div>
            ))}
          </div>
          {/* "Showing 8 of 260" counted a catalogue that does not exist
              here; these eight are the seeded sample. */}
          <div className="border-t border-[var(--line)] px-5 py-4 text-center">
            <p className="text-[0.8125rem] text-fg-subtle">
              A sample of the studio library. The full catalogue comes from your synthesis
              provider once one is configured.
            </p>
          </div>
        </Panel>

        {/*
          The pronunciation dictionary was removed rather than left in
          place. It listed three specific entries attributed to two named
          people, from a literal array, beside an "Add pronunciation" button
          with no handler. It is a synthesis feature and returns with
          synthesis.
        */}
      </div>
    </>
  );
}

/*
 * The per-voice waveform is gone. It rendered the same sixteen bars for
 * every voice, as though it were that voice's own sample — a picture of
 * audio nobody had.
 */
