import path from "node:path";

/**
 * Where the bundled typefaces are. libass is pointed here rather than at
 * the host's font directories, so a render looks the same on every machine
 * that runs a worker. Only font files may live there: libass loads every
 * file in the directory.
 */
export function fontsDirectory(): string {
  return process.env.RENDER_FONTS_DIR ?? path.join(process.cwd(), "lib", "render", "fonts");
}

/** The file for a family and weight, as bundled. "Open Sans" → OpenSans-Bold.ttf. */
export function fontFile(font: string, weight: "Regular" | "Bold"): string {
  return `${font.replace(/\s+/g, "")}-${weight}.ttf`;
}
