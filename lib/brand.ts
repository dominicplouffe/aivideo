/**
 * The brand kit: what a workspace looks like on every frame it exports.
 *
 * Shared by the editor, the Studio preview, the share page and the render
 * worker, so one definition of "the kit's caption style" reaches all four.
 * Nothing here touches a database or a file, which is what lets a client
 * component import it.
 *
 * What a kit carries is only what something applies. A "cursor" token and
 * a "music bed" token were listed here once; the cursor is baked into the
 * recorded pixels and there is no music library, so a person setting either
 * was choosing something nothing would do. They are gone until they are real.
 */

/** Typefaces the renderer has on disk. Must match `lib/render/fonts/`; see `lib/render/FONTS.md`. */
export const BRAND_FONTS = ["Inter", "Roboto", "Open Sans", "Montserrat", "Poppins", "Playfair Display"] as const;
export type BrandFont = (typeof BRAND_FONTS)[number];

/** How burned-in captions sit on the picture. */
export const CAPTION_STYLES = ["boxed-bottom", "boxed-top", "outline-bottom", "outline-top"] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

export const LOGO_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];

/** Three colours with jobs, not a palette to admire. */
export interface BrandColors {
  /** Buttons, highlights, the progress bar on the share page. */
  accent: string;
  /** Behind captions and on the intro and outro cards. */
  background: string;
  /** Text on that background. */
  text: string;
}

export interface BrandLogo {
  /** Storage path within the workspace. */
  key: string;
  contentType: string;
}

export interface BrandTokens {
  colors?: BrandColors;
  font?: BrandFont;
  logo?: BrandLogo;
  logoPosition?: LogoPosition;
  captionStyle?: CaptionStyle;
  /** A line under the title on the intro card. Empty means no intro card. */
  intro?: string;
  /** The outro card's line, e.g. "Start free at acme.com". Empty means no outro card. */
  outro?: string;
}

export const DEFAULT_COLORS: BrandColors = { accent: "#6E56F8", background: "#0B0D14", text: "#F5F7FF" };
export const DEFAULT_FONT: BrandFont = "Inter";
export const DEFAULT_CAPTION_STYLE: CaptionStyle = "boxed-bottom";
export const DEFAULT_LOGO_POSITION: LogoPosition = "bottom-right";

/** The intro and outro cards hold on screen for this long. */
export const CARD_SECONDS = 2.5;

export const MAX_CARD_TEXT = 80;
export const MAX_KIT_NAME = 60;
/** A logo is a small image. Past this it is a photograph. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** A kit with every gap filled, for anything that has to draw it. */
export interface ResolvedBrand {
  colors: BrandColors;
  font: BrandFont;
  logo: BrandLogo | null;
  logoPosition: LogoPosition;
  captionStyle: CaptionStyle;
  intro: string;
  outro: string;
}

export function resolveBrand(tokens: BrandTokens | null | undefined): ResolvedBrand {
  return {
    colors: tokens?.colors ?? DEFAULT_COLORS,
    font: tokens?.font ?? DEFAULT_FONT,
    logo: tokens?.logo ?? null,
    logoPosition: tokens?.logoPosition ?? DEFAULT_LOGO_POSITION,
    captionStyle: tokens?.captionStyle ?? DEFAULT_CAPTION_STYLE,
    intro: tokens?.intro ?? "",
    outro: tokens?.outro ?? "",
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/**
 * Tokens as the API accepts them. Anything not understood is dropped rather
 * than stored: a kit is read by the renderer with nobody watching, and an
 * unexpected value there is a failed render rather than a validation error.
 * Returns null when a field that is present is unusable, so the person
 * editing hears about it now.
 */
export function sanitizeBrandTokens(input: unknown): { tokens: BrandTokens } | { error: string } {
  if (input === null || typeof input !== "object") return { error: "tokens must be an object." };
  const raw = input as Record<string, unknown>;
  const tokens: BrandTokens = {};

  if (raw.colors !== undefined) {
    const c = raw.colors as Record<string, unknown> | null;
    if (!c || typeof c !== "object") return { error: "colors must be an object." };
    const accent = c.accent ?? DEFAULT_COLORS.accent;
    const background = c.background ?? DEFAULT_COLORS.background;
    const text = c.text ?? DEFAULT_COLORS.text;
    if (![accent, background, text].every(isHexColor)) {
      return { error: "Colours must be six-digit hex values like #6E56F8." };
    }
    tokens.colors = {
      accent: (accent as string).toUpperCase(),
      background: (background as string).toUpperCase(),
      text: (text as string).toUpperCase(),
    };
  }
  if (raw.font !== undefined) {
    if (!(BRAND_FONTS as readonly string[]).includes(raw.font as string)) {
      return { error: `font must be one of ${BRAND_FONTS.join(", ")}.` };
    }
    tokens.font = raw.font as BrandFont;
  }
  if (raw.captionStyle !== undefined) {
    if (!(CAPTION_STYLES as readonly string[]).includes(raw.captionStyle as string)) {
      return { error: "captionStyle is not one of the offered styles." };
    }
    tokens.captionStyle = raw.captionStyle as CaptionStyle;
  }
  if (raw.logoPosition !== undefined) {
    if (!(LOGO_POSITIONS as readonly string[]).includes(raw.logoPosition as string)) {
      return { error: "logoPosition is not one of the four corners." };
    }
    tokens.logoPosition = raw.logoPosition as LogoPosition;
  }
  for (const field of ["intro", "outro"] as const) {
    if (raw[field] === undefined) continue;
    if (typeof raw[field] !== "string") return { error: `${field} must be text.` };
    const text = (raw[field] as string).replace(/\s+/g, " ").trim();
    if (text.length > MAX_CARD_TEXT) return { error: `The ${field} line is at most ${MAX_CARD_TEXT} characters.` };
    tokens[field] = text;
  }
  // The logo is never set through tokens; it arrives as bytes on its own
  // route, which is the only place that knows it was really an image.
  return { tokens };
}

/** Where to fetch the kit's typeface for a browser, or null for the one the app already loads. */
export function googleFontsHref(font: BrandFont): string | null {
  if (font === DEFAULT_FONT) return null;
  return `https://fonts.googleapis.com/css2?family=${font.replace(/ /g, "+")}:wght@400;700&display=swap`;
}

export const CAPTION_STYLE_LABELS: Record<CaptionStyle, string> = {
  "boxed-bottom": "Boxed, at the bottom",
  "boxed-top": "Boxed, at the top",
  "outline-bottom": "Outlined text, at the bottom",
  "outline-top": "Outlined text, at the top",
};

export const LOGO_POSITION_LABELS: Record<LogoPosition, string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};

/** A readable foreground for a swatch, so a label on it is never invisible. */
export function contrastText(hex: string): "#000000" | "#FFFFFF" {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#000000" : "#FFFFFF";
}
