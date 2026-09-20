import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/app/Shared";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { brandKits } from "@/lib/app-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Brand kits" };

const tokens = [
  { key: "intro", label: "Intro" },
  { key: "outro", label: "Outro" },
  { key: "captionStyle", label: "Captions" },
  { key: "cursor", label: "Cursor" },
  { key: "music", label: "Music bed" },
  { key: "font", label: "Typeface" },
] as const;

export default function BrandPage() {
  const total = brandKits.reduce((n, k) => n + k.usedBy, 0);

  return (
    <>
      <PageHeader
        title="Brand kits"
        description={`Twelve design tokens applied to every frame your team exports. ${total} videos currently inherit a kit — change a token and they all re-render at their existing URLs.`}
        actions={
          <>
            <Button variant="outline" size="sm">
              <Icon name="download" className="size-4" strokeWidth={1.8} />
              Import from Figma
            </Button>
            <Button size="sm">
              <Icon name="plus" className="size-4" strokeWidth={2.2} />
              New kit
            </Button>
          </>
        }
      />

      <div className="grid gap-4 px-4 py-6 md:px-8 lg:grid-cols-3">
        {brandKits.map((kit) => (
          <Panel key={kit.id} className="flex flex-col">
            <div className="flex items-start gap-3 border-b border-[var(--line)] p-5">
              <span
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-[0.8125rem] font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${kit.colors[1]}, ${kit.colors[0]})` }}
              >
                M
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[0.9375rem] font-medium text-fg-strong">{kit.name}</h2>
                  {kit.locked ? (
                    <span
                      title="Locked by an admin"
                      className="inline-flex items-center gap-1 rounded bg-mint-500/15 px-1.5 py-0.5 text-2xs text-mint-400"
                    >
                      <Icon name="lock" className="size-2.5" strokeWidth={2.6} />
                      Locked
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-2xs text-fg-faint">{kit.usedBy} videos inherit this kit</p>
              </div>
            </div>

            <div className="border-b border-[var(--line)] p-5">
              <p className="mb-2.5 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">Palette</p>
              <div className="flex gap-1.5">
                {kit.colors.map((c) => (
                  <span key={c} className="flex-1">
                    <span className="block h-9 rounded-lg border border-white/8" style={{ background: c }} />
                    <span className="mt-1 block font-mono text-[0.5rem] text-fg-faint">{c}</span>
                  </span>
                ))}
              </div>
            </div>

            <dl className="flex-1 divide-y divide-[var(--line)]">
              {tokens.map((t) => (
                <div key={t.key} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <dt className="text-[0.75rem] text-fg-subtle">{t.label}</dt>
                  <dd className="truncate text-right font-mono text-2xs text-fg-muted">
                    {kit[t.key]}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="flex items-center gap-2 border-t border-[var(--line)] p-4">
              <Button variant="secondary" size="sm" className="flex-1">Edit tokens</Button>
              <Button variant="ghost" size="sm" iconOnly aria-label="Preview">
                <Icon name="eye" className="size-4" strokeWidth={1.8} />
              </Button>
              <Button variant="ghost" size="sm" iconOnly aria-label="Duplicate">
                <Icon name="copy" className="size-4" strokeWidth={1.8} />
              </Button>
            </div>
          </Panel>
        ))}
      </div>

      <div className="px-4 pb-8 md:px-8">
        <Panel title="Propagation" description="What happens when a token changes">
          <div className="grid gap-4 p-5 md:grid-cols-3">
            {[
              { i: "search" as const, t: "Stale detection", d: "Every video built on the kit is flagged the moment a token changes, with a diff of what moved." },
              { i: "refresh" as const, t: "Bulk re-render", d: "One approval re-renders the whole library, scheduled off-peak for large collections." },
              { i: "link" as const, t: "URLs preserved", d: "Assets republish in place, so embeds on your site keep working without anyone touching a page." },
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
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] bg-ink-900 px-5 py-4">
            <Icon name="alert" className="size-4 shrink-0 text-amber-400" strokeWidth={1.9} />
            <p className="min-w-0 flex-1 text-[0.8125rem] text-fg-muted">
              <span className="text-fg">14 videos</span> are running an older version of Meridian —
              Primary after last week's outro change.
            </p>
            <Button size="sm" className={cn("shrink-0")}>Re-render all</Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
