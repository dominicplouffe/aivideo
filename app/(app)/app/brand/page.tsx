import type { Metadata } from "next";
import { PageHeader, Panel, EmptyState } from "@/components/app/Shared";
import { Icon } from "@/components/ui/Icon";
import { getBrandKits } from "@/lib/data";

export const metadata: Metadata = { title: "Brand kits" };

const tokenRows = [
  { key: "font", label: "Typeface" },
  { key: "intro", label: "Intro" },
  { key: "outro", label: "Outro" },
  { key: "captionStyle", label: "Captions" },
  { key: "cursor", label: "Cursor" },
  { key: "music", label: "Music bed" },
] as const;

/**
 * Brand kits, from the `brand_kits` table.
 *
 * This page rendered a three-kit fixture on every workspace: "Meridian
 * Dark", "Meridian Light" and "Partner co-brand", with palettes, a Locked
 * badge claiming an admin had enforced one, and "48 videos inherit this
 * kit". None of it was stored anywhere. Below the cards, a Propagation panel
 * reported that "14 videos" were running an older kit version "after last
 * week's outro change" — an event that never happened — beside a
 * "Re-render all" button with no handler, and the header offered "Import
 * from Figma" and "New kit", neither of which did anything.
 *
 * What is here now is what the workspace has. Creating and editing kits goes
 * through the repository added alongside this page; the controls appear when
 * the routes behind them do, rather than before.
 */
export default async function BrandPage() {
  const kits = await getBrandKits();
  const inheriting = kits.reduce((n, k) => n + k.usedBy, 0);

  return (
    <>
      <PageHeader
        title="Brand kits"
        description={
          kits.length === 0
            ? "Design tokens applied to every frame your team exports. This workspace has no kits yet, so exports use the source footage as recorded."
            : `Design tokens applied to every frame your team exports. ${inheriting} ${
                inheriting === 1 ? "video inherits" : "videos inherit"
              } a kit — change a token and they re-render at their existing URLs.`
        }
      />

      <div className="px-4 py-6 md:px-8">
        {kits.length === 0 ? (
          <Panel title="Kits">
            <EmptyState
              icon="palette"
              title="No brand kits yet"
              description="A kit carries your colours, typeface, intro and outro, and applies them to every export. Nothing here is applied to your videos until you create one."
            />
          </Panel>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {kits.map((kit) => {
              const colors = kit.tokens.colors ?? [];
              return (
                <Panel key={kit.id} className="flex flex-col">
                  <div className="flex items-start gap-3 border-b border-[var(--line)] p-5">
                    <span
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-[0.8125rem] font-bold text-white"
                      style={{
                        background:
                          colors.length > 1
                            ? `linear-gradient(135deg, ${colors[1]}, ${colors[0]})`
                            : "linear-gradient(135deg, var(--color-violet-500), var(--color-iris-600))",
                      }}
                    >
                      {kit.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-[0.9375rem] font-medium text-fg-strong">
                          {kit.name}
                        </h2>
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
                      <p className="mt-0.5 text-2xs text-fg-faint">
                        {kit.usedBy} {kit.usedBy === 1 ? "video inherits" : "videos inherit"} this
                        kit · v{kit.version}
                      </p>
                    </div>
                  </div>

                  {colors.length > 0 ? (
                    <div className="border-b border-[var(--line)] p-5">
                      <p className="mb-2.5 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
                        Palette
                      </p>
                      <div className="flex gap-1.5">
                        {colors.map((c) => (
                          <span key={c} className="flex-1">
                            <span
                              className="block h-9 rounded-lg border border-fg/10"
                              style={{ background: c }}
                            />
                            <span className="mt-1 block font-mono text-[0.5rem] text-fg-faint">
                              {c}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <dl className="flex-1 divide-y divide-[var(--line)]">
                    {tokenRows
                      .filter((t) => kit.tokens[t.key])
                      .map((t) => (
                        <div
                          key={t.key}
                          className="flex items-center justify-between gap-3 px-5 py-2.5"
                        >
                          <dt className="text-[0.75rem] text-fg-subtle">{t.label}</dt>
                          <dd className="truncate text-right font-mono text-2xs text-fg-muted">
                            {kit.tokens[t.key]}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </Panel>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
