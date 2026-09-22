import path from "node:path";
import { spawn } from "node:child_process";
import type { Edl, EdlBrand, EdlMask, EdlZoom } from "./edl";
import type { LogoPosition } from "@/lib/brand";
import { fontFile, fontsDirectory } from "./fonts-path";

/**
 * Compiles an EDL into an FFmpeg invocation.
 *
 * Everything in this module except `runFfmpeg` and `probe` is a pure function
 * from data to strings, which is deliberate: a filter graph is a program, and
 * a program you cannot test without a GPU and a coffee break is a program
 * nobody will dare to change. The graph builders are unit-tested; the
 * end-to-end test renders a synthetic source and probes the result.
 */

/** Seconds a push takes to reach its framing, and to release it. */
const PUSH_IN_SEC = 0.35;
const PUSH_OUT_SEC = 0.35;

function n(value: number, places = 4): string {
  return Number(value.toFixed(places)).toString();
}

/** SRT wants `HH:MM:SS,mmm`. */
export function srtTimestamp(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const pad = (v: number, width = 2) => String(v).padStart(width, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rest, 3)}`;
}

/**
 * Burned-in captions, as a subtitle file rather than a drawtext chain.
 *
 * Timed against the cut, not the finished file: the captions are burned
 * onto the cut before the brand's cards are joined around it, so an intro
 * card shifts nothing here.
 */
export function toSrt(edl: Edl): string {
  return edl.captions
    .map((cue, i) =>
      [`${i + 1}`, `${srtTimestamp(cue.from)} --> ${srtTimestamp(cue.until)}`, cue.text, ""].join("\n"),
    )
    .join("\n");
}

/* ------------------------------------------------------------- brand */

/** `#RRGGBB` as libass writes colours: `&HAABBGGRR`, with 00 meaning opaque. */
export function assColor(hex: string, alpha = 0): string {
  const r = hex.slice(1, 3), g = hex.slice(3, 5), b = hex.slice(5, 7);
  return `&H${alpha.toString(16).padStart(2, "0")}${b}${g}${r}`.toUpperCase();
}

/**
 * The subtitle style a brand asks for.
 *
 * Sizes are in libass's default 384×288 play resolution, which the
 * subtitles filter scales to the output: a FontSize of 17 is about six
 * percent of the frame's height, the same as the Studio's preview draws.
 * A boxed style is BorderStyle 4, the box behind the whole line, with the
 * outline width doing duty as padding; an outlined style is a dark edge
 * and a soft shadow with no box.
 */
export function captionForceStyle(brand: EdlBrand): string {
  const boxed = brand.captionStyle.startsWith("boxed");
  const top = brand.captionStyle.endsWith("top");
  const style: Record<string, string | number> = {
    FontName: brand.font,
    FontSize: 17,
    Bold: 1,
    PrimaryColour: assColor(boxed ? brand.colors.text : "#FFFFFF"),
    Alignment: top ? 8 : 2,
    MarginV: 15,
    MarginL: 24,
    MarginR: 24,
  };
  if (boxed) {
    Object.assign(style, {
      BorderStyle: 4,
      // 80% opaque, like the preview's caption box.
      BackColour: assColor(brand.colors.background, 0x33),
      OutlineColour: assColor(brand.colors.background, 0x33),
      Outline: 4,
      Shadow: 0,
    });
  } else {
    Object.assign(style, {
      BorderStyle: 1,
      OutlineColour: assColor("#000000", 0x20),
      BackColour: assColor("#000000", 0x80),
      Outline: 1.4,
      Shadow: 1,
    });
  }
  return Object.entries(style)
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

/** Text as drawtext wants it inside a filter graph: its own escapes, then the graph's. */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

/** Where the logo sits in its corner, in output pixels: 3% in from the side, 4% from the top or bottom. */
function logoPlacement(position: LogoPosition, width: number, height: number): string {
  const mx = Math.round(width * 0.03);
  const my = Math.round(height * 0.04);
  const [v, h] = position.split("-");
  return `x=${h === "left" ? mx : `W-w-${mx}`}:y=${v === "top" ? my : `H-h-${my}`}`;
}

/**
 * The intro or outro card as a filter chain, with no input of its own: a
 * plain colour source, the text drawn on it, and the logo overlaid when
 * the kit has one. Fades toward the cut so the join is not a hard cut to
 * footage.
 */
function buildCardFilters(
  edl: Edl,
  which: "intro" | "outro",
  options: { logoLabel: string | null; fontsDir: string },
): { filters: string[]; out: string } | null {
  const card = which === "intro" ? edl.brand.intro : edl.brand.outro;
  if (!card) return null;
  const { width, height, fps } = edl.output;
  const brand = edl.brand;
  const filters: string[] = [];
  const bg = brand.colors.background.replace("#", "0x");
  const fg = brand.colors.text.replace("#", "0x");
  const title = which === "intro" ? (edl.brand.intro?.title ?? "") : "";
  const line = card.line;
  const bold = path.join(options.fontsDir, fontFile(brand.font, "Bold"));
  const regular = path.join(options.fontsDir, fontFile(brand.font, "Regular"));

  // Layout in fractions of the height, the same as the preview: the mark
  // near a third of the way down, the title at the middle, the line below.
  const hasMark = options.logoLabel !== null;
  const titleSize = Math.round(height * (which === "intro" ? 0.075 : 0.058));
  const lineSize = Math.round(height * 0.036);
  const steps = [`color=c=${bg}:s=${width}x${height}:r=${fps}:d=${n(card.durationSec)}`, "format=yuv420p", "setsar=1"];
  if (!hasMark) {
    // No logo: a short accent rule where the mark would be.
    const rw = Math.round(width * 0.12), rh = Math.max(2, Math.round(height * 0.012));
    steps.push(`drawbox=x=(iw-${rw})/2:y=${Math.round(height * 0.36)}:w=${rw}:h=${rh}:color=${brand.colors.accent.replace("#", "0x")}:t=fill`);
  }
  const text = which === "intro" ? title : line;
  const sub = which === "intro" ? line : "";
  if (text) {
    steps.push(
      `drawtext=fontfile='${escapeFilterPath(bold)}':text='${escapeDrawtext(text)}':fontsize=${titleSize}:fontcolor=${fg}` +
        `:x=(w-text_w)/2:y=${Math.round(height * 0.5)}-text_h/2`,
    );
  }
  if (sub) {
    steps.push(
      `drawtext=fontfile='${escapeFilterPath(regular)}':text='${escapeDrawtext(sub)}':fontsize=${lineSize}:fontcolor=${fg}@0.8` +
        `:x=(w-text_w)/2:y=${Math.round(height * 0.63)}`,
    );
  }
  const fade = which === "intro"
    ? `fade=t=out:st=${n(Math.max(0, card.durationSec - 0.35))}:d=0.35`
    : `fade=t=in:st=0:d=0.35`;
  const label = `card_${which}`;
  if (hasMark) {
    filters.push(`${steps.join(",")}[${label}_bg]`);
    filters.push(`[${label}_bg][${options.logoLabel}]overlay=x=(W-w)/2:y=${Math.round(height * 0.3)}-h/2,${fade}[${label}]`);
  } else {
    filters.push(`${steps.join(",")},${fade}[${label}]`);
  }
  return { filters, out: label };
}

/**
 * The cut: one trim per surviving clip, concatenated in order.
 *
 * `setpts=PTS-STARTPTS` on each trim is what makes the concat produce a
 * continuous timeline instead of a video that freezes for the length of
 * everything that was removed.
 */
export function buildCutFilters(edl: Edl): { filters: string[]; out: string } {
  const filters: string[] = [];
  const labels: string[] = [];

  // A browser's screen capture writes a frame only when the picture changes
  // — one a second on a still screen — so a trim of that stream ends at its
  // last frame, not at the cut, and every clip comes out short by up to a
  // second. Made constant-rate first, so a trim is the length it says.
  const sources = edl.clips.map((_, i) => `[v${i}]`);
  filters.push(
    `[0:v]fps=${edl.output.fps}${edl.clips.length > 1 ? `,split=${edl.clips.length}` : ""}${sources.join("")}`,
  );

  edl.clips.forEach((clip, i) => {
    const label = `c${i}`;
    const speed = clip.speed ?? 1;
    // Rebase, then scale: a clip at 2× has its timestamps halved, and a held
    // frame clones the last frame for the hold (`tpad` with clone).
    const steps = [
      `trim=start=${n(clip.sourceStart)}:end=${n(clip.sourceEnd)}`,
      Math.abs(speed - 1) > 1e-6 ? `setpts=(PTS-STARTPTS)/${n(speed)}` : "setpts=PTS-STARTPTS",
    ];
    if ((clip.holdSec ?? 0) > 1e-3) steps.push(`tpad=stop_mode=clone:stop_duration=${n(clip.holdSec!)}`);
    filters.push(`[v${i}]${steps.join(",")}[${label}]`);
    labels.push(`[${label}]`);
  });

  if (labels.length === 1) return { filters, out: "c0" };

  filters.push(`${labels.join("")}concat=n=${labels.length}:v=1:a=0[vcat]`);
  return { filters, out: "vcat" };
}

/**
 * Cuts the source's own audio the same way the video was cut.
 *
 * This is the one that makes a person's voice come out the other end. The
 * audio graph was built entirely around *synthesized* narration — tracks
 * from the EDL, mixed and ducked — and when there were none it emitted
 * `-an`, so a screen recording of somebody talking rendered silent. The
 * recording had audio the whole way through; nothing ever asked for it.
 *
 * `asetpts=PTS-STARTPTS` is the audio counterpart of the video's `setpts`:
 * without it the concatenated stream keeps the original timestamps and
 * drifts out of sync by the length of everything that was removed.
 */
export function buildSourceAudioFilters(edl: Edl): { filters: string[]; out: string } {
  const filters: string[] = [];
  const labels: string[] = [];

  edl.clips.forEach((clip, i) => {
    const label = `sa${i}`;
    filters.push(
      `[0:a]atrim=start=${n(clip.sourceStart)}:end=${n(clip.sourceEnd)},asetpts=PTS-STARTPTS[${label}]`,
    );
    labels.push(`[${label}]`);
  });

  if (labels.length === 1) return { filters, out: "sa0" };

  filters.push(`${labels.join("")}concat=n=${labels.length}:v=0:a=1[sacat]`);
  return { filters, out: "sacat" };
}

/**
 * Builds the zoom expression for `zoompan`.
 *
 * A keyframe is a push in, a hold, and a release. Expressed as one nested
 * conditional over input time, because zoompan evaluates a single expression
 * per frame and has no notion of keyframes. Read it as: inside this
 * keyframe's ramp, interpolate; inside its hold, sit at the target;
 * otherwise, fall through to the next keyframe, and finally to 1.
 */
export function zoomExpression(zooms: EdlZoom[]): string {
  return zooms.reduceRight((rest, z) => {
    const inEnd = z.at + PUSH_IN_SEC;
    const outStart = Math.max(inEnd, z.at + z.holdSec - PUSH_OUT_SEC);
    const end = z.at + z.holdSec;
    const target = n(z.scale);
    const rampIn = `1+(${target}-1)*(it-${n(z.at)})/${n(PUSH_IN_SEC)}`;
    const rampOut = `${target}-(${target}-1)*(it-${n(outStart)})/${n(end - outStart || PUSH_OUT_SEC)}`;
    return (
      `if(between(it,${n(z.at)},${n(inEnd)}),${rampIn},` +
      `if(between(it,${n(inEnd)},${n(outStart)}),${target},` +
      `if(between(it,${n(outStart)},${n(end)}),${rampOut},${rest})))`
    );
  }, "1");
}

/**
 * Anchor expression for one axis.
 *
 * zoompan's x and y are the top-left of the crop window in source pixels, so
 * the anchor has to be converted from "the point to centre on" and clamped to
 * the frame — otherwise a zoom near an edge shows black.
 */
export function anchorExpression(zooms: EdlZoom[], axis: "x" | "y"): string {
  const dim = axis === "x" ? "iw" : "ih";
  return zooms.reduceRight((rest, z) => {
    const anchor = axis === "x" ? z.anchor.x : z.anchor.y;
    const window = `${dim}/zoom`;
    const centred = `${dim}*${n(anchor)}-(${window})/2`;
    const clamped = `max(0,min(${dim}-${window},${centred}))`;
    return `if(between(it,${n(z.at)},${n(z.at + z.holdSec)}),${clamped},${rest})`;
  }, `(${dim}-${dim}/zoom)/2`);
}

/**
 * Masking.
 *
 * `redact` is a filled box — one filter, no copy of the frame. Blur and
 * pixelate have to operate on a copy of the region and be composited back,
 * because the filters themselves have no notion of a sub-rectangle.
 */
export function buildMaskFilters(
  masks: EdlMask[],
  input: string,
  width: number,
  height: number,
): { filters: string[]; out: string } {
  const filters: string[] = [];
  let current = input;

  masks.forEach((mask, i) => {
    const [rx, ry, rw, rh] = mask.rect;
    // Even dimensions: most filters reject odd widths on chroma-subsampled
    // pixel formats, and a mask that fails the render protects nobody.
    const x = Math.round(rx * width / 2) * 2;
    const y = Math.round(ry * height / 2) * 2;
    const w = Math.max(2, Math.round(rw * width / 2) * 2);
    const h = Math.max(2, Math.round(rh * height / 2) * 2);
    const enable = `between(t,${n(mask.from)},${n(mask.until)})`;
    const next = `mk${i}`;

    if (mask.style === "redact") {
      filters.push(
        `[${current}]drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=black@1:t=fill:enable='${enable}'[${next}]`,
      );
    } else {
      // A box blur's radius is bounded by the smallest plane it touches. On
      // 4:2:0 the chroma planes are half size, so a radius above
      // min(w, h) / 4 is rejected outright — and a narrow mask over a single
      // form field is exactly the shape that trips it.
      const blurRadius = Math.max(1, Math.min(20, Math.floor(Math.min(w, h) / 4) - 1));
      const treatment =
        mask.style === "pixelate"
          ? `pixelize=w=${Math.max(2, Math.round(w / 12))}:h=${Math.max(2, Math.round(h / 12))}`
          : `boxblur=${blurRadius}:2`;
      filters.push(
        `[${current}]split=2[bs${i}][cp${i}]`,
        `[cp${i}]crop=${w}:${h}:${x}:${y},${treatment}[bl${i}]`,
        `[bs${i}][bl${i}]overlay=x=${x}:y=${y}:enable='${enable}'[${next}]`,
      );
    }
    current = next;
  });

  return { filters, out: current };
}

/**
 * The audio mix.
 *
 * Narration clips are delayed to their place on the timeline and mixed;
 * music, when present, is compressed against the narration so it drops out
 * of the way of speech instead of fighting it at a fixed level.
 */
export function buildAudioFilters(edl: Edl): { filters: string[]; out: string | null } {
  const filters: string[] = [];
  const narration: string[] = [];
  let music: string | null = null;

  edl.audio.forEach((track, i) => {
    // Input 0 is the source video; audio inputs follow in EDL order.
    const inputIndex = i + 1;
    const label = `a${i}`;
    const delayMs = Math.round(track.at * 1000);
    const steps = [`[${inputIndex}:a]`];
    // Tempo before delay: the stretch is to the clip, the delay is to where
    // the shortened clip sits on the output timeline.
    if (track.tempo !== undefined && Math.abs(track.tempo - 1) > 1e-3) {
      steps.push(`atempo=${n(track.tempo)},`);
    }
    if (delayMs > 0) steps.push(`adelay=${delayMs}:all=1,`);
    steps.push(`volume=${n(track.gainDb)}dB[${label}]`);
    filters.push(steps.join(""));

    if (track.kind === "music") music = label;
    else narration.push(label);
  });

  if (narration.length === 0 && music === null) return { filters: [], out: null };

  if (narration.length === 0) return pad(filters, music!, edl.durationSec);

  let speech = narration[0];
  if (narration.length > 1) {
    filters.push(`${narration.map((l) => `[${l}]`).join("")}amix=inputs=${narration.length}:normalize=0[speech]`);
    speech = "speech";
  }

  if (music === null) return pad(filters, speech, edl.durationSec);

  const duckBy = edl.audio.find((t) => t.kind === "music")?.ducksBy ?? 8;
  filters.push(
    `[${speech}]asplit=2[sc][sk]`,
    // ratio is how hard music is pushed down once speech crosses the
    // threshold; derived from the EDL's duck depth rather than hardcoded.
    `[${music}][sc]sidechaincompress=threshold=0.03:ratio=${n(Math.max(2, duckBy))}:attack=20:release=300[duck]`,
    `[sk][duck]amix=inputs=2:normalize=0[amixed]`,
  );
  return pad(filters, "amixed", edl.durationSec);
}

/**
 * Pads the mix with silence to the length of the edit.
 *
 * Without this, `-shortest` truncates the *video* to the end of the last
 * narration clip — a five-second edit narrated for three seconds comes back
 * as a three-second video.
 *
 * The padding is bounded explicitly. A bare `apad` emits silence forever and
 * leaves `-shortest` to stop it, which it does not reliably do for a
 * filter-generated stream: the encoder keeps writing until the disk gives
 * out. `whole_dur` makes the length a fact rather than a race.
 */
function pad(filters: string[], out: string, durationSec: number): { filters: string[]; out: string } {
  return {
    filters: [...filters, `[${out}]apad=whole_dur=${n(durationSec)}[aout]`],
    out: "aout",
  };
}

export interface FfmpegPlan {
  args: string[];
  /** The subtitle file the graph expects, when captions are burned in. */
  subtitlePath: string | null;
}

export interface CompileOptions {
  sourcePath: string;
  outputPath: string;
  /** Local paths for `edl.audio`, in the same order. */
  audioPaths?: string[];
  /** Where to write burned-in captions. Omit to skip them. */
  subtitlePath?: string;
  /**
   * Whether the source file actually carries an audio stream.
   *
   * A probed fact, not a guess: referencing `[0:a]` on a file that has none
   * makes FFmpeg fail the whole graph, so this cannot default to true.
   */
  sourceHasAudio?: boolean;
  /** Overwrite an existing output. */
  overwrite?: boolean;
  /** The brand's logo, staged locally. Required when `edl.brand.logo` is set. */
  logoPath?: string;
  /** Where the bundled typefaces are. Defaults to `fontsDirectory()`. */
  fontsDir?: string;
}

/** Escapes a path for use inside a filter argument. */
function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/**
 * The audio for an edit that has no synthesized narration.
 *
 * Source audio, cut to match the video, with any music bed ducked under it.
 * Falls back to the existing music-only path when the source is silent, and
 * to no audio at all when there is neither.
 */
function buildSourceAudioMix(
  edl: Edl,
  sourceHasAudio: boolean,
): { filters: string[]; out: string | null } {
  if (!sourceHasAudio) return buildAudioFilters(edl);

  const source = buildSourceAudioFilters(edl);
  const music = edl.audio.find((track) => track.kind === "music");
  if (!music) return pad(source.filters, source.out, edl.durationSec);

  const inputIndex = edl.audio.indexOf(music) + 1;
  const filters = [
    ...source.filters,
    `[${inputIndex}:a]volume=${n(music.gainDb)}dB[mbed]`,
    `[${source.out}]asplit=2[msc][msk]`,
    `[mbed][msc]sidechaincompress=threshold=0.03:ratio=${n(Math.max(2, music.ducksBy ?? 8))}:attack=20:release=300[mduck]`,
    `[msk][mduck]amix=inputs=2:normalize=0[smixed]`,
  ];
  return pad(filters, "smixed", edl.durationSec);
}

export function compile(edl: Edl, options: CompileOptions): FfmpegPlan {
  const { width, height, fps } = edl.output;
  const filters: string[] = [];

  const cut = buildCutFilters(edl);
  filters.push(...cut.filters);

  // Normalise to the output frame before anything positional happens, so
  // every coordinate downstream is in output pixels.
  filters.push(
    `[${cut.out}]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[vscaled]`,
  );
  let current = "vscaled";

  if (edl.zooms.length > 0) {
    filters.push(
      `[${current}]zoompan=z='${zoomExpression(edl.zooms)}':` +
        `x='${anchorExpression(edl.zooms, "x")}':y='${anchorExpression(edl.zooms, "y")}':` +
        // d=1 means "one output frame per input frame". The default of 25
        // turns every frame into a one-second still.
        `d=1:s=${width}x${height}:fps=${fps}[vzoom]`,
    );
    current = "vzoom";
  }

  const masked = buildMaskFilters(edl.masks, current, width, height);
  filters.push(...masked.filters);
  current = masked.out;

  const fontsDir = options.fontsDir ?? fontsDirectory();
  const subtitlePath = edl.captions.length > 0 ? (options.subtitlePath ?? null) : null;
  if (subtitlePath) {
    filters.push(
      `[${current}]subtitles='${escapeFilterPath(subtitlePath)}':fontsdir='${escapeFilterPath(fontsDir)}'` +
        `:force_style='${captionForceStyle(edl.brand)}'[vburn]`,
    );
    current = "vburn";
  }

  // The logo is one more input, after the audio files, so its index is
  // known here. Split when the cards need a copy of it too.
  const logo = edl.brand.logo && options.logoPath ? { path: options.logoPath, index: 1 + (options.audioPaths ?? []).length } : null;
  const cards = [edl.brand.intro ? "intro" : null, edl.brand.outro ? "outro" : null].filter(Boolean) as ("intro" | "outro")[];
  if (logo) {
    const copies = 1 + cards.length;
    const labels = ["logo_corner", ...cards.map((c) => `logo_${c}`)];
    filters.push(
      `[${logo.index}:v]format=rgba${copies > 1 ? `,split=${copies}` : ""}${labels.map((l) => `[${l}_raw]`).join("")}`,
    );
    // 7% of the frame's height in the corner, twice that on a card: the
    // same proportions the Studio's preview draws.
    filters.push(`[logo_corner_raw]scale=-2:${Math.round(height * 0.07)}[logo_corner]`);
    for (const c of cards) filters.push(`[logo_${c}_raw]scale=-2:${Math.round(height * 0.14)}[logo_${c}]`);
    filters.push(`[${current}][logo_corner]overlay=${logoPlacement(edl.brand.logo!.position, width, height)}[vlogo]`);
    current = "vlogo";
  }

  // Narration replaces the original voice; that is the point of a studio
  // voice. With no narration, the source's own audio is what the video is,
  // and dropping it is how a walkthrough comes back silent.
  const hasNarration = edl.audio.some((track) => track.kind !== "music");
  const audio = hasNarration
    ? buildAudioFilters(edl)
    : buildSourceAudioMix(edl, Boolean(options.sourceHasAudio));
  filters.push(...audio.filters);
  let audioOut = audio.out;

  // The cards, around the cut. Video and audio are each concatenated in
  // the same order; the cut's audio is held to the cut's length first, so
  // a reading that ran past the footage cannot push the outro card late.
  if (cards.length > 0) {
    const videoParts: string[] = [];
    const audioParts: string[] = [];
    filters.push(`[${current}]format=yuv420p,setsar=1[vbody]`);
    if (audioOut) {
      filters.push(`[${audioOut}]atrim=0:${n(edl.durationSec)},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo[abody]`);
    }
    for (const which of cards) {
      const card = buildCardFilters(edl, which, { logoLabel: logo ? `logo_${which}` : null, fontsDir });
      if (!card) continue;
      filters.push(...card.filters);
      const duration = which === "intro" ? edl.brand.intro!.durationSec : edl.brand.outro!.durationSec;
      if (audioOut) filters.push(`anullsrc=r=48000:cl=stereo:d=${n(duration)}[a_${which}]`);
      if (which === "intro") {
        videoParts.push(`[${card.out}]`, "[vbody]");
        if (audioOut) audioParts.push(`[a_${which}]`, "[abody]");
      } else {
        if (videoParts.length === 0) {
          videoParts.push("[vbody]");
          if (audioOut) audioParts.push("[abody]");
        }
        videoParts.push(`[${card.out}]`);
        if (audioOut) audioParts.push(`[a_${which}]`);
      }
    }
    filters.push(`${videoParts.join("")}concat=n=${videoParts.length}:v=1:a=0[vfinal]`);
    current = "vfinal";
    if (audioOut) {
      filters.push(`${audioParts.join("")}concat=n=${audioParts.length}:v=0:a=1[afinal]`);
      audioOut = "afinal";
    }
  }

  const args: string[] = [];
  if (options.overwrite !== false) args.push("-y");
  args.push("-i", options.sourcePath);
  for (const path of options.audioPaths ?? []) args.push("-i", path);
  if (logo) args.push("-i", logo.path);

  args.push("-filter_complex", filters.join(";"));
  args.push("-map", `[${current}]`);
  if (audioOut) {
    args.push("-map", `[${audioOut}]`);
    args.push("-c:a", edl.output.audioCodec, "-b:a", "192k");
    // Paired with `apad` above: audio is padded past the video and then cut
    // back to it, so the video's length always wins.
    args.push("-shortest");
  } else {
    args.push("-an");
  }

  args.push(
    "-c:v",
    edl.output.videoCodec === "h264" ? "libx264" : "libvpx-vp9",
    "-crf",
    String(edl.output.crf),
    "-preset",
    "medium",
    // yuv420p is the format every player and browser accepts. Without it a
    // perfectly good render will not play on half the devices that matter.
    "-pix_fmt",
    "yuv420p",
    // Moves the index to the front so the video starts playing before it has
    // finished downloading.
    "-movflags",
    "+faststart",
    "-r",
    String(fps),
    options.outputPath,
  );

  return { args, subtitlePath };
}

export interface ProbeResult {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

export async function probe(path: string, binary = "ffprobe"): Promise<ProbeResult> {
  const output = await run(binary, [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    path,
  ]);

  const parsed = JSON.parse(output.stdout) as {
    format?: { duration?: string };
    streams?: { codec_type?: string; width?: number; height?: number; avg_frame_rate?: string }[];
  };

  const video = parsed.streams?.find((s) => s.codec_type === "video");
  const [num, den] = (video?.avg_frame_rate ?? "0/1").split("/").map(Number);

  return {
    durationSec: Number(parsed.format?.duration ?? 0),
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: den ? num / den : 0,
    hasAudio: Boolean(parsed.streams?.some((s) => s.codec_type === "audio")),
  };
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

/**
 * Pulls the actual complaint out of FFmpeg's output.
 *
 * The naive approach — print the last N lines — reliably shows the encoder's
 * closing statistics and hides the one line that says what went wrong, which
 * is usually a few hundred lines earlier. Matching on the shape of an error
 * first, and only falling back to the tail, is the difference between a
 * two-minute fix and an afternoon.
 */
export function diagnose(stderr: string): string {
  const lines = stderr.trim().split(/\r?\n/);
  const interesting = lines.filter((line) =>
    /\b(error|invalid|failed|unable|not found|no such|unsupported|cannot)\b/i.test(line),
  );
  const chosen = interesting.length > 0 ? interesting : lines.slice(-8);
  return chosen.slice(0, 12).join("\n");
}

function run(binary: string, args: string[], onLine?: (line: string) => void): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (onLine) for (const line of text.split(/\r?\n/)) if (line) onLine(line);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${binary} exited with ${code}:\n${diagnose(stderr)}`));
    });
  });
}

/** Parses FFmpeg's `time=` progress reports into a 0..1 fraction. */
export function parseProgress(line: string, durationSec: number): number | null {
  const match = /time=(\d+):(\d+):(\d+\.?\d*)/.exec(line);
  if (!match || durationSec <= 0) return null;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return Math.min(1, seconds / durationSec);
}

export async function runFfmpeg(
  args: string[],
  options: { binary?: string; durationSec?: number; onProgress?: (fraction: number) => void } = {},
): Promise<RunResult> {
  return run(options.binary ?? "ffmpeg", args, (line) => {
    if (!options.onProgress || !options.durationSec) return;
    const progress = parseProgress(line, options.durationSec);
    if (progress !== null) options.onProgress(progress);
  });
}
