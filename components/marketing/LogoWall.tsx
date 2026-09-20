import { cn } from "@/lib/utils";
import { customers } from "@/lib/marketing-data";

/**
 * Customer wordmarks. Rendered as type rather than logo files — these are
 * fictional companies, and type keeps the row crisp on every display.
 */
export function LogoWall({
  className,
  label = "Trusted by product teams shipping software people actually understand",
  marquee = true,
}: {
  className?: string;
  label?: string | null;
  marquee?: boolean;
}) {
  const row = [...customers, ...customers];
  return (
    <div className={cn("relative", className)}>
      {label ? (
        <p className="mb-8 text-center font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
          {label}
        </p>
      ) : null}

      {marquee ? (
        <div className="mask-fade-x overflow-hidden">
          <div className="flex w-max animate-marquee items-center gap-14">
            {row.map((c, i) => (
              <Wordmark key={`${c.slug}-${i}`} name={c.name} letterSpacing={c.letterSpacing} />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 items-center justify-items-center gap-x-8 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          {customers.slice(0, 12).map((c) => (
            <Wordmark key={c.slug} name={c.name} letterSpacing={c.letterSpacing} />
          ))}
        </div>
      )}
    </div>
  );
}

function Wordmark({ name, letterSpacing }: { name: string; letterSpacing?: string }) {
  return (
    <span
      className="shrink-0 text-[1.0625rem] font-semibold whitespace-nowrap text-fg-faint transition-colors duration-300 hover:text-fg-muted"
      style={{ letterSpacing: letterSpacing ?? "-0.02em" }}
    >
      {name}
    </span>
  );
}
