"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { EmptyState, Panel } from "@/components/app/Shared";
import {
  BRAND_FONTS,
  CAPTION_STYLES,
  CAPTION_STYLE_LABELS,
  DEFAULT_COLORS,
  LOGO_POSITIONS,
  LOGO_POSITION_LABELS,
  LOGO_TYPES,
  MAX_CARD_TEXT,
  MAX_KIT_NAME,
  MAX_LOGO_BYTES,
  resolveBrand,
  type BrandColors,
  type BrandTokens,
  type CaptionStyle,
  type LogoPosition,
  type BrandFont,
} from "@/lib/brand";
import { BrandPreview, Swatch, kitLogoUrl, useBrandFont } from "./BrandPreview";

/** A kit as GET /api/brand-kits describes it. */
export interface KitRecord {
  id: string;
  name: string;
  locked: boolean;
  tokens: BrandTokens;
  version: number;
  usedBy: number;
  updatedAt: string;
}

/**
 * The brand kits page: every kit the workspace has, each shown as a frame
 * it would produce, with an editor that previews as you type.
 *
 * A kit is edited in a dialog rather than inline on the card because the
 * useful thing to look at while changing a colour is the preview, and the
 * preview needs the width.
 */
export function BrandKitsEditor({
  initialKits,
  canEdit,
  workspaceName,
}: {
  initialKits: KitRecord[];
  canEdit: boolean;
  workspaceName: string;
}) {
  const router = useRouter();
  const [kits, setKits] = useState(initialKits);
  const [editing, setEditing] = useState<KitRecord | "new" | null>(null);

  const reload = async () => {
    const response = await fetch("/api/brand-kits");
    const body = (await response.json()) as { data?: KitRecord[] };
    if (body.data) setKits(body.data);
    // The Studio's brand tab and the project cards read kits on the server.
    router.refresh();
  };

  return (
    <div className="px-4 py-6 md:px-8">
      {kits.length === 0 ? (
        <Panel title="Kits">
          <EmptyState
            icon="palette"
            title="No brand kits yet"
            description="A kit carries your logo, colours and typeface, and applies them to captions, the intro and outro cards, and the share page of every export you point at it."
            action={
              canEdit ? (
                <Button size="sm" onClick={() => setEditing("new")}>
                  <Icon name="plus" className="size-4" strokeWidth={2} />
                  Create a kit
                </Button>
              ) : null
            }
          />
        </Panel>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-[0.8125rem] text-fg-subtle">
              {kits.length} {kits.length === 1 ? "kit" : "kits"}. Pick one for a project in the Studio, under Brand.
            </p>
            {canEdit ? (
              <Button size="sm" onClick={() => setEditing("new")}>
                <Icon name="plus" className="size-4" strokeWidth={2} />
                New kit
              </Button>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {kits.map((kit) => {
              const brand = resolveBrand(kit.tokens);
              return (
                <Panel key={kit.id} className="flex flex-col overflow-hidden">
                  <div className="p-3 pb-0">
                    <BrandPreview brand={brand} logoUrl={kitLogoUrl(kit)} />
                  </div>
                  <div className="flex items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-[0.9375rem] font-medium text-fg-strong">{kit.name}</h2>
                        {kit.locked ? (
                          <span
                            title="Locked: applied to a project as it is, with no overrides"
                            className="inline-flex items-center gap-1 rounded bg-mint-500/15 px-1.5 py-0.5 text-2xs text-mint-400"
                          >
                            <Icon name="lock" className="size-2.5" strokeWidth={2.6} />
                            Locked
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-2xs text-fg-faint">
                        {kit.usedBy === 0 ? "Not used by any project yet" : `${kit.usedBy} ${kit.usedBy === 1 ? "project uses" : "projects use"} this kit`} · {brand.font} · v{kit.version}
                      </p>
                    </div>
                    {canEdit ? (
                      <Button variant="outline" size="sm" onClick={() => setEditing(kit)}>
                        Edit
                      </Button>
                    ) : null}
                  </div>
                  <div className="flex gap-1.5 border-t border-[var(--line)] p-3">
                    <Swatch hex={brand.colors.accent} label="Accent" className="h-12 flex-1" />
                    <Swatch hex={brand.colors.background} label="Background" className="h-12 flex-1" />
                    <Swatch hex={brand.colors.text} label="Text" className="h-12 flex-1" />
                  </div>
                </Panel>
              );
            })}
          </div>
        </>
      )}

      {editing ? (
        <KitDialog
          kit={editing === "new" ? null : editing}
          suggestedName={workspaceName}
          takenNames={kits.filter((k) => editing === "new" || k.id !== editing.id).map((k) => k.name.toLowerCase())}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------- dialog */

interface Draft {
  name: string;
  colors: BrandColors;
  font: BrandFont;
  captionStyle: CaptionStyle;
  logoPosition: LogoPosition;
  intro: string;
  outro: string;
  locked: boolean;
}

function draftFrom(kit: KitRecord | null, suggestedName: string): Draft {
  const b = resolveBrand(kit?.tokens);
  return {
    name: kit?.name ?? suggestedName,
    colors: { ...b.colors },
    font: b.font,
    captionStyle: b.captionStyle,
    logoPosition: b.logoPosition,
    intro: b.intro,
    outro: b.outro,
    locked: kit?.locked ?? false,
  };
}

function KitDialog({
  kit,
  suggestedName,
  takenNames,
  onClose,
  onSaved,
}: {
  kit: KitRecord | null;
  suggestedName: string;
  takenNames: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(kit, suggestedName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showCard, setShowCard] = useState<"intro" | "outro" | null>(null);
  // The logo, as the person sees it right now: the kit's, a file they just
  // chose (shown from memory until saved), or removed.
  const [logo, setLogo] = useState<{ file: File; url: string } | "removed" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => () => { if (logo && logo !== "removed") URL.revokeObjectURL(logo.url); }, [logo]);

  const brand = resolveBrand({
    colors: draft.colors,
    font: draft.font,
    captionStyle: draft.captionStyle,
    logoPosition: draft.logoPosition,
    intro: draft.intro,
    outro: draft.outro,
  });
  const logoUrl = logo === "removed" ? null : logo ? logo.url : kit ? kitLogoUrl(kit) : null;
  const nameTaken = takenNames.includes(draft.name.trim().toLowerCase());
  useBrandFont(draft.font);

  const chooseLogo = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!(LOGO_TYPES as readonly string[]).includes(file.type)) {
      setError("A logo is a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(`A logo is at most ${MAX_LOGO_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setLogo({ file, url: URL.createObjectURL(file) });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: draft.name.trim(),
        locked: draft.locked,
        tokens: {
          colors: draft.colors,
          font: draft.font,
          captionStyle: draft.captionStyle,
          logoPosition: draft.logoPosition,
          intro: draft.intro,
          outro: draft.outro,
        },
      };
      const response = await fetch(kit ? `/api/brand-kits/${kit.id}` : "/api/brand-kits", {
        method: kit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { kit?: KitRecord; error?: string };
      if (!response.ok || !body.kit) throw new Error(body.error ?? "The kit was not saved.");
      const id = body.kit.id;

      if (logo === "removed" && kit?.tokens.logo) {
        const removed = await fetch(`/api/brand-kits/${id}/logo`, { method: "DELETE" });
        if (!removed.ok) throw new Error("The kit was saved but the logo could not be removed.");
      } else if (logo && logo !== "removed") {
        const uploaded = await fetch(`/api/brand-kits/${id}/logo`, {
          method: "PUT",
          headers: { "Content-Type": logo.file.type },
          body: logo.file,
        });
        const result = (await uploaded.json()) as { error?: string };
        if (!uploaded.ok) throw new Error(result.error ?? "The kit was saved but the logo was not.");
      }
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!kit) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/brand-kits/${kit.id}`, { method: "DELETE" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The kit was not deleted.");
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-lg border border-[var(--line)] bg-ink-950 px-2.5 py-1.5 text-[0.8125rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none";
  const label = "mb-1 block text-2xs font-medium tracking-[0.12em] text-fg-faint uppercase";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={kit ? `Edit ${kit.name}` : "New brand kit"}
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-ink-900 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)]"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
          <h2 className="text-[0.9375rem] font-medium text-fg-strong">{kit ? `Edit ${kit.name}` : "New brand kit"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-ink-850 hover:text-fg">
            <Icon name="x" className="size-4" strokeWidth={2} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[1fr_1.15fr]">
          {/* ---- form */}
          <form
            className="space-y-5 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="block">
              <span className={label}>Name</span>
              <input value={draft.name} maxLength={MAX_KIT_NAME} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={field} required autoFocus />
              {nameTaken ? <span className="mt-1 block text-2xs text-rose-300">There is already a kit with this name.</span> : null}
            </label>

            <div>
              <span className={label}>Logo</span>
              <div className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-ink-950 p-2.5">
                <span className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md" style={{ background: brand.colors.background }}>
                  {logoUrl ? <img src={logoUrl} alt="" className="max-h-9 max-w-[4.5rem] object-contain" /> : <Icon name="frame" className="size-4 text-fg-faint" strokeWidth={1.6} />}
                </span>
                <div className="min-w-0 flex-1 text-2xs text-fg-faint">
                  PNG with a transparent background works best. Shown small in a corner of the video and larger on the intro card.
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button type="button" variant="outline" size="xs" onClick={() => fileInput.current?.click()}>
                    {logoUrl ? "Replace" : "Upload"}
                  </Button>
                  {logoUrl ? (
                    <Button type="button" variant="ghost" size="xs" onClick={() => setLogo("removed")}>
                      Remove
                    </Button>
                  ) : null}
                </div>
                <input ref={fileInput} type="file" accept={LOGO_TYPES.join(",")} className="hidden" onChange={(e) => chooseLogo(e.target.files?.[0])} />
              </div>
              {logoUrl ? (
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {LOGO_POSITIONS.map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setDraft({ ...draft, logoPosition: pos })}
                      className={cn(
                        "rounded-md border px-1.5 py-1 text-2xs transition-colors",
                        draft.logoPosition === pos ? "border-iris-500/60 bg-iris-500/15 text-fg" : "border-[var(--line)] text-fg-subtle hover:bg-ink-850",
                      )}
                    >
                      {LOGO_POSITION_LABELS[pos]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <span className={label}>Colours</span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["accent", "Accent", "Buttons and highlights"],
                    ["background", "Background", "Behind captions and cards"],
                    ["text", "Text", "On that background"],
                  ] as const
                ).map(([key, name, hint]) => (
                  <label key={key} className="block rounded-lg border border-[var(--line)] bg-ink-950 p-2">
                    <span className="flex items-center gap-2">
                      <input
                        type="color"
                        value={draft.colors[key]}
                        onChange={(e) => setDraft({ ...draft, colors: { ...draft.colors, [key]: e.target.value.toUpperCase() } })}
                        className="size-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                        aria-label={`${name} colour`}
                      />
                      <span className="min-w-0">
                        <span className="block text-[0.75rem] text-fg">{name}</span>
                        <span className="block font-mono text-2xs text-fg-faint">{draft.colors[key]}</span>
                      </span>
                    </span>
                    <span className="mt-1 block text-2xs leading-snug text-fg-faint">{hint}</span>
                  </label>
                ))}
              </div>
              <button type="button" className="mt-1.5 text-2xs text-fg-faint underline-offset-2 hover:underline" onClick={() => setDraft({ ...draft, colors: { ...DEFAULT_COLORS } })}>
                Reset colours
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Typeface</span>
                <select value={draft.font} onChange={(e) => setDraft({ ...draft, font: e.target.value as BrandFont })} className={field} style={{ fontFamily: `"${draft.font}", Inter, sans-serif` }}>
                  {BRAND_FONTS.map((font) => (
                    <option key={font} value={font}>{font}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={label}>Captions</span>
                <select value={draft.captionStyle} onChange={(e) => setDraft({ ...draft, captionStyle: e.target.value as CaptionStyle })} className={field}>
                  {CAPTION_STYLES.map((style) => (
                    <option key={style} value={style}>{CAPTION_STYLE_LABELS[style]}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block" onFocus={() => setShowCard("intro")} onBlur={() => setShowCard(null)}>
                <span className={label}>Intro card line</span>
                <input value={draft.intro} maxLength={MAX_CARD_TEXT} placeholder="A short line under the title" onChange={(e) => setDraft({ ...draft, intro: e.target.value })} className={field} />
                <span className="mt-1 block text-2xs text-fg-faint">Shown for 2.5 s before the video, under the project's title. Leave empty for no intro.</span>
              </label>
              <label className="block" onFocus={() => setShowCard("outro")} onBlur={() => setShowCard(null)}>
                <span className={label}>Outro card line</span>
                <input value={draft.outro} maxLength={MAX_CARD_TEXT} placeholder="Start free at acme.com" onChange={(e) => setDraft({ ...draft, outro: e.target.value })} className={field} />
                <span className="mt-1 block text-2xs text-fg-faint">Shown for 2.5 s after the video ends. Leave empty for no outro.</span>
              </label>
            </div>

            <button
              type="button"
              onClick={() => setDraft({ ...draft, locked: !draft.locked })}
              aria-pressed={draft.locked}
              className="flex w-full items-center gap-3 rounded-lg border border-[var(--line)] px-3 py-2 text-left transition-colors hover:bg-ink-850"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[0.8125rem] text-fg">Locked</span>
                <span className="block text-2xs text-fg-faint">A project using this kit takes it as it is. Nobody can switch off its captions or logo from the Studio.</span>
              </span>
              <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", draft.locked ? "bg-iris-500" : "bg-ink-700")}>
                <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-transform", draft.locked ? "translate-x-4" : "translate-x-0.5")} />
              </span>
            </button>

            {error ? (
              <p className="flex items-start gap-1.5 text-[0.75rem] text-rose-300">
                <Icon name="alert" className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.2} />
                {error}
              </p>
            ) : null}

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" size="sm" disabled={busy || !draft.name.trim() || nameTaken}>
                {busy ? "Saving…" : kit ? "Save kit" : "Create kit"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              {kit ? (
                <span className="ml-auto">
                  {confirmDelete ? (
                    <span className="flex items-center gap-2 text-2xs text-fg-subtle">
                      {kit.usedBy > 0 ? `${kit.usedBy} ${kit.usedBy === 1 ? "project goes" : "projects go"} back to no kit.` : "This cannot be undone."}
                      <Button type="button" size="xs" variant="danger" onClick={() => void remove()} disabled={busy}>
                        Delete
                      </Button>
                      <Button type="button" size="xs" variant="ghost" onClick={() => setConfirmDelete(false)}>
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <Button type="button" variant="ghost" size="sm" className="text-rose-300 hover:text-rose-200" onClick={() => setConfirmDelete(true)} disabled={busy}>
                      <Icon name="trash" className="size-3.5" strokeWidth={1.9} />
                      Delete kit
                    </Button>
                  )}
                </span>
              ) : null}
            </div>
          </form>

          {/* ---- live preview */}
          <aside className="border-t border-[var(--line)] bg-ink-950 p-5 md:border-t-0 md:border-l">
            <p className="mb-2.5 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">Preview</p>
            <BrandPreview brand={brand} logoUrl={logoUrl} card={showCard} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setShowCard(showCard === "intro" ? null : "intro")} className="text-left">
                <BrandPreview brand={brand} logoUrl={logoUrl} card="intro" className={cn("transition-shadow", showCard === "intro" && "ring-2 ring-iris-500/60")} />
                <span className="mt-1 block text-2xs text-fg-faint">Intro card{draft.intro ? "" : " · off"}</span>
              </button>
              <button type="button" onClick={() => setShowCard(showCard === "outro" ? null : "outro")} className="text-left">
                <BrandPreview brand={brand} logoUrl={logoUrl} card="outro" className={cn("transition-shadow", showCard === "outro" && "ring-2 ring-iris-500/60")} />
                <span className="mt-1 block text-2xs text-fg-faint">Outro card{draft.outro ? "" : " · off"}</span>
              </button>
            </div>
            <p className="mt-3 text-2xs leading-relaxed text-fg-faint">
              Captions use the kit's typeface and colours in the export exactly as shown. The logo is scaled to a fixed height in its corner. The share page takes the accent colour and the logo.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
