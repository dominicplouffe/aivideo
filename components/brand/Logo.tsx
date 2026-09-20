import { cn } from "@/lib/utils";

/**
 * The DemoRiff mark: three rounded bars whose silhouette reads both as an
 * audio waveform and as a play triangle — a raw take becoming a finished cut.
 */
export function LogoMark({
  className,
  gradientId = "dr-mark",
}: {
  className?: string;
  gradientId?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-8", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6E56F8" />
          <stop offset="0.48" stopColor="#A855F7" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <rect x="8" y="6" width="3.6" height="20" rx="1.8" fill="white" fillOpacity="0.95" />
      <rect x="14.2" y="9" width="3.6" height="14" rx="1.8" fill="white" fillOpacity="0.8" />
      <rect x="20.4" y="12" width="3.6" height="8" rx="1.8" fill="white" fillOpacity="0.62" />
    </svg>
  );
}

export function Wordmark({
  className,
  markClassName,
  showMark = true,
}: {
  className?: string;
  markClassName?: string;
  showMark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {showMark ? <LogoMark className={cn("size-7", markClassName)} /> : null}
      <span className="text-[1.0625rem] font-semibold tracking-[-0.03em] text-fg-strong">
        Demo<span className="text-fg-muted">Riff</span>
      </span>
    </span>
  );
}
