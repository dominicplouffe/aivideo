"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  contrastText,
  googleFontsHref,
  type ResolvedBrand,
} from "@/lib/brand";

/**
 * Loads the kit's typeface for the browser, once per font, by appending a
 * stylesheet link to the document head.
 *
 * Not React's `<link precedence>`: that holds every render that introduces
 * the stylesheet until the font has loaded, so choosing a typeface in the
 * editor froze the form until Google Fonts answered, and with the request
 * slow or blocked the choice never appeared at all.
 */
export function useBrandFont(font: ResolvedBrand["font"]) {
  const href = googleFontsHref(font);
  useEffect(() => {
    if (!href) return;
    const id = `brand-font-${font.replace(/\W+/g, "-").toLowerCase()}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }, [font, href]);
}

/**
 * A frame as the kit would render it: footage stand-in, caption in the
 * kit's typeface and colours where the kit puts it, logo in its corner.
 * Used by the editor while a person types and by the Studio's brand tab,
 * so the two never show different ideas of the same kit.
 */
export function BrandPreview({
  brand,
  logoUrl,
  caption = "Here is where your captions will appear",
  title = "Your product, in ninety seconds",
  card = null,
  className,
}: {
  brand: ResolvedBrand;
  /** Where the browser can load the kit's logo, or null for none. */
  logoUrl: string | null;
  caption?: string;
  title?: string;
  /** Show the intro or outro card instead of a frame of footage. */
  card?: "intro" | "outro" | null;
  className?: string;
}) {
  useBrandFont(brand.font);
  const fontFamily = `"${brand.font}", Inter, system-ui, sans-serif`;
  return (
    <div
      className={cn("relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--line)] bg-[#0B0D14]", className)}
      // A container, so the caption and card text size with the frame (cqw).
      style={{ fontFamily, containerType: "inline-size" }}
    >
      {card ? (
        <BrandCard brand={brand} logoUrl={logoUrl} title={card === "intro" ? title : brand.outro} line={card === "intro" ? brand.intro : ""} kind={card} />
      ) : (
        <>
          {/* A stand-in for the recording: a window with a few rows. */}
          <div className="absolute inset-[7%_6%_10%_6%] rounded-md border border-white/10 bg-[#141826]">
            <div className="flex h-[12%] items-center gap-[2%] border-b border-white/10 px-[3%]">
              <span className="size-[5%] rounded-full bg-white/20" />
              <span className="size-[5%] rounded-full bg-white/20" />
              <span className="size-[5%] rounded-full bg-white/20" />
            </div>
            <div className="space-y-[6%] px-[5%] py-[7%]">
              <span className="block h-[4%] w-[38%] rounded bg-white/25" style={{ background: brand.colors.accent, opacity: 0.85 }} />
              <span className="block h-[3%] w-[70%] rounded bg-white/15" />
              <span className="block h-[3%] w-[55%] rounded bg-white/15" />
            </div>
          </div>
          <BrandCaption brand={brand} text={caption} />
          {logoUrl ? <BrandLogo url={logoUrl} position={brand.logoPosition} /> : null}
        </>
      )}
    </div>
  );
}

/**
 * Positioned and coloured the way the renderer's subtitle style is. The
 * parent must be a size container (`containerType: inline-size`) so the
 * text scales with the frame.
 */
export function BrandCaption({ brand, text }: { brand: ResolvedBrand; text: string }) {
  const boxed = brand.captionStyle.startsWith("boxed");
  const top = brand.captionStyle.endsWith("top");
  return (
    <div className={cn("absolute inset-x-0 flex justify-center px-[6%]", top ? "top-[5%]" : "bottom-[5%]")}>
      <span
        className={cn("max-w-[80%] text-center font-semibold leading-snug", boxed ? "rounded-[0.3em] px-[0.6em] py-[0.3em]" : "")}
        style={{
          // Scales with the frame, like a subtitle does.
          fontSize: "clamp(8px, 3.4cqw, 22px)",
          color: boxed ? brand.colors.text : "#FFFFFF",
          background: boxed ? hexWithAlpha(brand.colors.background, 0.8) : "transparent",
          textShadow: boxed ? undefined : "0 0 2px #000, 0 0 2px #000, 0 1px 3px rgba(0,0,0,0.9)",
          WebkitTextStroke: boxed ? undefined : "0.02em rgba(0,0,0,0.8)",
        }}
      >
        {text}
      </span>
    </div>
  );
}

export function BrandLogo({ url, position }: { url: string; position: ResolvedBrand["logoPosition"] }) {
  const [v, h] = position.split("-") as ["top" | "bottom", "left" | "right"];
  return (
    // 7% of the frame's height, the same as the renderer scales it to.
    <img
      src={url}
      alt=""
      className={cn("absolute h-[7%] w-auto max-w-[30%] object-contain", v === "top" ? "top-[4%]" : "bottom-[4%]", h === "left" ? "left-[3%]" : "right-[3%]")}
    />
  );
}

/** The intro or outro card, as the renderer draws it. */
export function BrandCard({
  brand,
  logoUrl,
  title,
  line,
  kind,
}: {
  brand: ResolvedBrand;
  logoUrl: string | null;
  title: string;
  line: string;
  kind: "intro" | "outro";
}) {
  const fg = brand.colors.text;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-[4%] px-[8%] text-center" style={{ background: brand.colors.background, color: fg }}>
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-[14%] w-auto max-w-[40%] object-contain" />
      ) : (
        <span className="block h-[2%] w-[12%] rounded-full" style={{ background: brand.colors.accent }} />
      )}
      {title ? (
        <p className="max-w-full font-bold leading-tight" style={{ fontSize: kind === "intro" ? "clamp(10px, 6cqw, 40px)" : "clamp(9px, 4.6cqw, 32px)" }}>
          {title}
        </p>
      ) : null}
      {line ? (
        <p className="max-w-full leading-snug opacity-80" style={{ fontSize: "clamp(7px, 3cqw, 20px)" }}>
          {line}
        </p>
      ) : null}
    </div>
  );
}

/** A colour chip with its hex value printed on it in whichever ink shows. */
export function Swatch({ hex, label, className }: { hex: string; label?: string; className?: string }) {
  return (
    <span className={cn("flex flex-col items-start justify-end rounded-lg border border-fg/10 p-2", className)} style={{ background: hex, color: contrastText(hex) }}>
      {label ? <span className="text-2xs font-medium opacity-80">{label}</span> : null}
      <span className="font-mono text-2xs">{hex}</span>
    </span>
  );
}

export function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return `${hex}${a}`;
}

/** The URL the app serves a kit's logo from, versioned so a replaced logo is never the cached one. */
export function kitLogoUrl(kit: { id: string; version: number; tokens: { logo?: unknown } }): string | null {
  return kit.tokens.logo ? `/api/brand-kits/${kit.id}/logo?v=${kit.version}` : null;
}
