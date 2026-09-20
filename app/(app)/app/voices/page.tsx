import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/app/Shared";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { voices } from "@/lib/app-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Voices" };

export default function VoicesPage() {
  const clones = voices.filter((v) => v.kind === "clone");
  const studio = voices.filter((v) => v.kind === "studio");

  return (
    <>
      <PageHeader
        title="Voices"
        description="260 licensed studio voices tuned for product narration, plus clones of your own team. Every voice speaks all 34 supported languages."
        actions={
          <Button size="sm">
            <Icon name="mic" className="size-4" strokeWidth={1.8} />
            Clone a voice
          </Button>
        }
      />

      <div className="space-y-4 px-4 py-6 md:px-8">
        <Panel
          title="Your clones"
          description="Consent recorded and revocable by the person cloned"
        >
          <ul className="divide-y divide-[var(--line)]">
            {clones.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-cyan-500),var(--color-mint-500))]">
                  <Icon name="avatar" className="size-4 text-white" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[0.9375rem] font-medium text-fg-strong">{v.name}</span>
                    <span className="rounded bg-mint-500/15 px-1.5 py-0.5 text-2xs text-mint-400">
                      Consented {v.consented}
                    </span>
                  </span>
                  <span className="block text-[0.8125rem] text-fg-subtle">
                    {v.descriptor} · {v.accent} · {v.languages} languages
                  </span>
                </span>
                <Waveform active />
                <span className="flex shrink-0 items-center gap-1.5">
                  <Button variant="secondary" size="sm">
                    <Icon name="play" className="size-3" />
                    Preview
                  </Button>
                  <Button variant="ghost" size="sm" iconOnly aria-label="Revoke">
                    <Icon name="trash" className="size-4" strokeWidth={1.8} />
                  </Button>
                </span>
              </li>
            ))}
          </ul>

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
                <Waveform />
              </div>
            ))}
          </div>
          <div className="border-t border-[var(--line)] px-5 py-4 text-center">
            <p className="text-[0.8125rem] text-fg-subtle">
              Showing 8 of 260. Filter by language, accent, timbre, pace and register in the Studio,
              and audition each candidate on your actual script.
            </p>
          </div>
        </Panel>

        <Panel title="Pronunciation dictionary" description="Shared across every project, voice and language">
          <ul className="divide-y divide-[var(--line)]">
            {[
              { w: "Meridian", p: "/məˈrɪdiən/", by: "Renata Alves" },
              { w: "SKU", p: "spelled out: S-K-U", by: "Daniel Okafor" },
              { w: "FTL", p: "spelled out: F-T-L", by: "Daniel Okafor" },
            ].map((e) => (
              <li key={e.w} className="flex items-center gap-4 px-5 py-3">
                <span className="w-32 shrink-0 text-[0.875rem] text-fg-strong">{e.w}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] text-cyan-300">{e.p}</span>
                <span className="shrink-0 text-2xs text-fg-faint">added by {e.by}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-[var(--line)] p-4">
            <Button variant="outline" size="sm">
              <Icon name="plus" className="size-4" strokeWidth={2.2} />
              Add pronunciation
            </Button>
          </div>
        </Panel>
      </div>
    </>
  );
}

function Waveform({ active }: { active?: boolean }) {
  const bars = [4, 9, 6, 13, 8, 15, 7, 11, 5, 12, 9, 6, 14, 8, 10, 6];
  return (
    <span className="flex h-6 shrink-0 items-end gap-[2px]">
      {bars.map((h, i) => (
        <span
          key={i}
          className={cn("w-[2px] rounded-full", active ? "bg-cyan-400" : "bg-fg-faint/45")}
          style={{ height: `${h}px` }}
        />
      ))}
    </span>
  );
}
