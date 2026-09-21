import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/app/Shared";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { avatars } from "@/lib/app-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Presenters" };

export default function AvatarsPage() {
  const custom = avatars.filter((a) => a.kind === "custom");
  const stock = avatars.filter((a) => a.kind === "stock");

  return (
    <>
      <PageHeader
        title="Presenters"
        description="Presenters overlay a speaking figure on a recording. This needs a synthesis provider; the gallery below is the seeded sample."
        actions={
          <Button size="sm">
            <Icon name="avatar" className="size-4" strokeWidth={1.8} />
            Train a presenter
          </Button>
        }
      />

      <div className="space-y-4 px-4 py-6 md:px-8">
        <Panel title="Custom presenters" description="Trained on six minutes of guided capture">
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {custom.map((a) => (
              <AvatarCard key={a.id} avatar={a} />
            ))}
            <button
              type="button"
              className="flex min-h-[14rem] flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-[var(--line-strong)] p-5 text-center transition-colors hover:border-iris-500/50 hover:bg-iris-500/[0.04]"
            >
              <Icon name="plus" className="size-6 text-iris-400" strokeWidth={1.8} />
              <span className="text-[0.8125rem] font-medium text-fg">Train a new presenter</span>
              <span className="text-2xs leading-snug text-fg-faint">
                Six minutes of guided capture, ready in about two hours
              </span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] bg-ink-900 px-5 py-4">
            <Icon name="shield" className="size-4 shrink-0 text-mint-400" strokeWidth={1.9} />
            <p className="min-w-0 flex-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
              Custom presenters require recorded consent from the person depicted, kept alongside
              the model. Revocation is their right, not the workspace's — revoking disables future
              renders immediately and flags existing videos for replacement.
            </p>
          </div>
        </Panel>

        <Panel
          title="Licensed library"
          description="Filter by language, region, register, wardrobe and setting"
        >
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {stock.map((a) => (
              <AvatarCard key={a.id} avatar={a} />
            ))}
          </div>
          <div className="border-t border-[var(--line)] px-5 py-4 text-center">
            <p className="text-[0.8125rem] text-fg-subtle">
              A sample of the presenter library. The full catalogue comes from your synthesis
              provider once one is configured. Every presenter is licensed for commercial use,
              with no per-video royalty.
            </p>
          </div>
        </Panel>

        <Panel title="Composition" description="How the presenter behaves inside the frame">
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            {[
              { i: "frame" as const, t: "Collision aware", d: "The bubble moves away from the active zoom region and shrinks when a modal opens beneath it." },
              { i: "eye" as const, t: "Fades for detail", d: "Steps out of frame while the narration describes something specific on screen, and returns for the close." },
              { i: "globe" as const, t: "Speaks every language", d: "Lip movement is re-matched per language rather than dubbed over the English mouth shapes." },
              { i: "layers" as const, t: "Four placements", d: "Circle bubble, rounded card, full-frame intro, or a handoff that alternates with the screen." },
            ].map((c) => (
              <div key={c.t} className="flex gap-3">
                <Icon name={c.i} className="mt-0.5 size-4 shrink-0 text-iris-400" strokeWidth={1.8} />
                <div>
                  <p className="text-[0.875rem] font-medium text-fg-strong">{c.t}</p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">{c.d}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

function AvatarCard({ avatar }: { avatar: (typeof avatars)[number] }) {
  return (
    <div className="group overflow-hidden rounded-xl border border-[var(--line)] transition-colors hover:border-[var(--line-strong)]">
      <div className="relative aspect-[3/4]" style={{ background: avatar.gradient }}>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-2">
          <span className="size-11 rounded-full bg-black/25" />
          <span className="-mt-1.5 h-10 w-14 rounded-t-2xl bg-black/20" />
        </div>
        {avatar.kind === "custom" ? (
          <span className="absolute top-2 left-2 rounded bg-black/55 px-1.5 py-0.5 text-2xs text-white/85">
            Custom
          </span>
        ) : null}
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
            <Icon name="play" className="size-3.5 text-white/90" />
          </span>
        </span>
      </div>
      <div className="p-3">
        <p className="text-[0.8125rem] font-medium text-fg-strong">{avatar.name}</p>
        <p className="mt-0.5 text-2xs leading-snug text-fg-faint">{avatar.descriptor}</p>
        <p className="mt-0.5 text-2xs text-fg-faint">{avatar.setting}</p>
      </div>
    </div>
  );
}
