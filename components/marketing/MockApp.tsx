import { cn } from "@/lib/utils";

/**
 * The fictional SaaS being demoed inside every DemoRiff screenshot on this
 * site. Kept as markup (not an image) so it stays crisp at any zoom level —
 * which is the whole point of the zoom animation sitting on top of it.
 */
export function MockApp({ className, highlight }: { className?: string; highlight?: boolean }) {
  const bars = [38, 56, 44, 72, 61, 88, 70, 95, 78, 66, 84, 92];
  const rows = [
    { id: "SHP-4821", route: "Rotterdam → Chicago", eta: "2 days", status: "On time", tone: "mint" },
    { id: "SHP-4822", route: "Shenzhen → Long Beach", eta: "9 days", status: "Delayed", tone: "amber" },
    { id: "SHP-4823", route: "Hamburg → Newark", eta: "4 days", status: "On time", tone: "mint" },
    { id: "SHP-4824", route: "Busan → Oakland", eta: "12 days", status: "At risk", tone: "rose" },
  ] as const;

  return (
    <div className={cn("flex h-full w-full bg-[#0B0D14] text-left", className)}>
      {/* sidebar */}
      <div className="hidden w-[13%] shrink-0 flex-col gap-3 border-r border-white/5 p-3 sm:flex">
        <div className="flex items-center gap-1.5">
          <div className="size-3.5 rounded-[5px] bg-gradient-to-br from-cyan-400 to-iris-500" />
          <div className="h-1.5 w-8 rounded-full bg-white/25" />
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-1.5 rounded px-1 py-1" style={i === 1 ? { background: "rgba(255,255,255,0.06)" } : undefined}>
              <div className={cn("size-2 rounded-sm", i === 1 ? "bg-iris-400" : "bg-white/15")} />
              <div className={cn("h-1 rounded-full", i === 1 ? "bg-white/45" : "bg-white/12")} style={{ width: `${34 + ((i * 13) % 26)}%` }} />
            </div>
          ))}
        </div>
      </div>

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* topbar */}
        <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 rounded-full bg-white/30" />
            <div className="h-1 w-8 rounded-full bg-white/12" />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-14 rounded-md bg-white/8" />
            <div
              data-mock-target="new-shipment"
              className={cn(
                "h-4 w-16 rounded-md bg-gradient-to-r from-iris-500 to-violet-500 transition-shadow duration-500",
                highlight && "shadow-[0_0_0_2px_rgba(34,211,238,0.85),0_0_22px_2px_rgba(34,211,238,0.45)]",
              )}
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
          {/* KPI row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { l: "In transit", v: "1,284", d: "+12%", tone: "text-mint-400" },
              { l: "On-time rate", v: "96.4%", d: "+2.1%", tone: "text-mint-400" },
              { l: "Avg. dwell", v: "3.2h", d: "−18m", tone: "text-mint-400" },
              { l: "At risk", v: "23", d: "+4", tone: "text-rose-400" },
            ].map((k) => (
              <div key={k.l} className="rounded-md border border-white/6 bg-white/[0.03] p-1.5">
                <div className="text-[0.4rem] leading-none text-white/35">{k.l}</div>
                <div className="mt-1 text-[0.6rem] leading-none font-semibold text-white/85">{k.v}</div>
                <div className={cn("mt-0.5 text-[0.38rem] leading-none", k.tone)}>{k.d}</div>
              </div>
            ))}
          </div>

          {/* chart */}
          <div className="rounded-md border border-white/6 bg-white/[0.03] p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="h-1 w-14 rounded-full bg-white/22" />
              <div className="flex gap-1">
                <div className="h-2 w-5 rounded bg-white/8" />
                <div className="h-2 w-5 rounded bg-iris-500/40" />
              </div>
            </div>
            <div className="flex h-12 items-end gap-[3px]">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-[2px]"
                  style={{
                    height: `${h}%`,
                    background:
                      i >= bars.length - 3
                        ? "linear-gradient(180deg,#22D3EE,#6E56F8)"
                        : "rgba(255,255,255,0.14)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* table */}
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-white/6 bg-white/[0.03]">
            <div className="flex items-center gap-2 border-b border-white/6 px-2 py-1">
              {["Shipment", "Route", "ETA", "Status"].map((h, i) => (
                <div key={h} className="text-[0.4rem] text-white/30" style={{ width: i === 1 ? "38%" : "20%" }}>
                  {h}
                </div>
              ))}
            </div>
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2 border-b border-white/4 px-2 py-[5px] last:border-0">
                <div className="w-[20%] font-mono text-[0.4rem] text-white/60">{r.id}</div>
                <div className="w-[38%] truncate text-[0.4rem] text-white/45">{r.route}</div>
                <div className="w-[20%] text-[0.4rem] text-white/45">{r.eta}</div>
                <div className="w-[20%]">
                  <span
                    className={cn(
                      "inline-block rounded-full px-1 py-[1px] text-[0.35rem]",
                      r.tone === "mint" && "bg-mint-500/18 text-mint-400",
                      r.tone === "amber" && "bg-amber-500/18 text-amber-400",
                      r.tone === "rose" && "bg-rose-500/18 text-rose-400",
                    )}
                  >
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
