import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/app/Shared";
import { Icon } from "@/components/ui/Icon";
import { VoiceClones } from "@/components/app/VoiceClones";
import { StudioLibrary } from "@/components/app/StudioLibrary";
import { viewerMay } from "@/lib/data";
import { providerReport } from "@/lib/providers";

export const metadata: Metadata = { title: "Voices" };

export default async function VoicesPage() {
  // Whether synthesis resolved to a vendor or to the deterministic mock.
  // The page used to assert a licensed catalogue either way.
  const synthesis = providerReport().find((c) => c.capability === "synthesis");
  const canManage = await viewerMay("voice.manage");

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

        <StudioLibrary
          canManage={canManage}
          synthesisLive={synthesis?.live ?? false}
          synthesisMissing={synthesis?.missing ?? []}
        />

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
