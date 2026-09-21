import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/app/Shared";
import { Icon } from "@/components/ui/Icon";
import { VoiceClones } from "@/components/app/VoiceClones";
import { getVoices } from "@/lib/data";
import { providerReport } from "@/lib/providers";

export const metadata: Metadata = { title: "Voices" };

export default async function VoicesPage() {
  const voices = await getVoices();
  const studio = voices.filter((v) => v.kind === "studio");

  // Whether synthesis resolved to a vendor or to the deterministic mock.
  // The page used to assert a licensed catalogue either way.
  const synthesis = providerReport().find((c) => c.capability === "synthesis");

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

        <Panel
          title="Studio library"
          description="Voices offered by your synthesis provider"
        >
          {/*
            This rendered four fixture voices — Ava, Marcus, Yuki and Sofia,
            with accents, descriptors and a favourite star — under the claim
            "Licensed for unlimited commercial use, worldwide". Nothing was
            licensed, because nothing existed: none of the four was in the
            voices table, so selecting one for a render would have failed to
            find it. A workspace's studio voices are the rows it has.
          */}
          {studio.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-[0.875rem] text-fg-muted">No studio voices available.</p>
              <p className="mx-auto mt-2 max-w-md text-[0.8125rem] leading-relaxed text-fg-subtle">
                {synthesis?.live
                  ? "Your synthesis provider has not published a voice to this workspace yet."
                  : `Synthesis is not configured, so there is no catalogue to read. Set ${
                      synthesis?.missing.join(" and ") || "a synthesis provider"
                    } to enable it. Until then a video carries the voice on the recording.`}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
              {studio.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--line)] p-4 transition-colors hover:border-[var(--line-strong)]"
                >
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-iris-600),var(--color-violet-500))]">
                    <Icon name="play" className="size-3.5 text-white" />
                  </span>
                  <p className="text-[0.875rem] font-medium text-fg-strong">{v.name}</p>
                </div>
              ))}
            </div>
          )}
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
