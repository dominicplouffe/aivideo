"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  readThemePreference,
  setThemePreference,
  themeOptions,
  type ThemePreference,
} from "@/lib/theme";

/**
 * Light / Dark / System.
 *
 * The current value is read after mount rather than during render: the
 * server does not know this device's preference, and guessing would make
 * the first paint disagree with the stored choice.
 */
export function ThemePicker() {
  const [preference, setPreference] = useState<ThemePreference | null>(null);

  useEffect(() => setPreference(readThemePreference()), []);

  const choose = (next: ThemePreference) => {
    setThemePreference(next);
    setPreference(next);
  };

  return (
    <div role="radiogroup" aria-label="Appearance" className="grid gap-2 sm:grid-cols-3">
      {themeOptions.map((option) => {
        const selected = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={preference === null}
            onClick={() => choose(option.value)}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-colors",
              selected
                ? "border-iris-500/60 bg-[color-mix(in_oklab,var(--color-iris-500)_10%,transparent)]"
                : "border-[var(--line)] hover:border-[var(--line-strong)] hover:bg-ink-850",
            )}
          >
            <Swatch value={option.value} />
            <span>
              <span className="block text-[0.8125rem] font-medium text-fg-strong">{option.label}</span>
              <span className="block text-2xs text-fg-faint">{option.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A miniature of the rendering being offered — drawn from the real palette. */
function Swatch({ value }: { value: ThemePreference }) {
  const halves: ("light" | "dark")[] = value === "system" ? ["light", "dark"] : [value, value];
  return (
    <span className="flex h-10 w-full overflow-hidden rounded-lg border border-[var(--line-strong)]">
      {halves.map((half, i) => (
        <span key={i} data-theme={half} className="flex flex-1 items-end gap-1 bg-ink-1000 p-1.5">
          <span className="h-1.5 w-5 rounded-full bg-fg-strong/80" />
          <span className="h-1.5 w-3 rounded-full bg-fg-faint/70" />
        </span>
      ))}
    </span>
  );
}
