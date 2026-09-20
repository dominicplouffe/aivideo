"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Card } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";

const usd = (n: number) =>
  n >= 1000
    ? `$${Math.round(n).toLocaleString("en-US")}`
    : `$${Math.round(n)}`;

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label className="text-[0.875rem] font-medium text-fg">{label}</label>
        <span className="font-mono text-[0.875rem] text-iris-300 tabular-nums">
          {value}
          {suffix ? <span className="ml-1 text-fg-faint">{suffix}</span> : null}
        </span>
      </div>
      {hint ? <p className="mt-1 text-2xs text-fg-faint">{hint}</p> : null}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none
          [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
          [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-iris-500)_45%,transparent)]
          [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0
          [&::-moz-range-thumb]:bg-white"
        style={{
          background: `linear-gradient(90deg, var(--color-iris-500) ${pct}%, color-mix(in oklab, var(--color-fg) 12%, transparent) ${pct}%)`,
        }}
      />
    </div>
  );
}

export function RoiCalculator() {
  const [videosNeeded, setVideosNeeded] = useState(40);
  const [videosMade, setVideosMade] = useState(9);
  const [minutesEach, setMinutesEach] = useState(3);
  const [agencyRate, setAgencyRate] = useState(2200);
  const [internalHours, setInternalHours] = useState(14);
  const [hourlyCost, setHourlyCost] = useState(95);
  const [languages, setLanguages] = useState(4);
  const [localizationRate, setLocalizationRate] = useState(900);

  const model = useMemo(() => {
    const made = Math.min(videosMade, videosNeeded);
    const unmade = Math.max(0, videosNeeded - made);

    const agencySpend = made * minutesEach * agencyRate;
    const internalSpend = made * internalHours * hourlyCost;
    const localizationSpend = made * Math.max(0, languages - 1) * localizationRate;
    const currentTotal = agencySpend + internalSpend + localizationSpend;

    // Value left on the table: what the unmade videos would have cost to produce,
    // which is the fairest proxy for the work that simply did not happen.
    const unmadeValue = unmade * (minutesEach * agencyRate + internalHours * hourlyCost);

    // With DemoRiff: everything gets made, and the cost is the plan plus review time.
    const totalMinutes = videosNeeded * minutesEach;
    const plan =
      totalMinutes <= 60 ? { name: "Starter", monthly: 39 }
      : totalMinutes <= 240 ? { name: "Team", monthly: 129 }
      : totalMinutes <= 900 ? { name: "Scale", monthly: 449 }
      : { name: "Enterprise", monthly: 2500 };
    const planAnnual = plan.monthly * 12;
    const reviewHours = videosNeeded * 0.6; // ~35 minutes per video, mostly reading the script
    const reviewSpend = reviewHours * hourlyCost;
    const newTotal = planAnnual + reviewSpend;

    const savings = currentTotal - newTotal;
    const hoursSaved = made * internalHours - reviewHours;
    const coverageBefore = Math.round((made / videosNeeded) * 100);

    return {
      made, unmade, agencySpend, internalSpend, localizationSpend, currentTotal,
      unmadeValue, plan, planAnnual, reviewSpend, reviewHours, newTotal, savings,
      hoursSaved, coverageBefore, totalMinutes,
    };
  }, [videosNeeded, videosMade, minutesEach, agencyRate, internalHours, hourlyCost, languages, localizationRate]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-10">
      {/* inputs */}
      <Card className="flex flex-col gap-7 p-6 md:p-7">
        <div>
          <h2 className="text-[1.0625rem] font-semibold">Your current year</h2>
          <p className="mt-1 text-[0.8125rem] text-fg-subtle">
            Adjust these to match your team. Nothing is sent anywhere.
          </p>
        </div>

        <Slider
          label="Videos your roadmap needs"
          hint="Customer-visible releases, help content and launch assets"
          value={videosNeeded} min={5} max={200} onChange={setVideosNeeded}
        />
        <Slider
          label="Videos you actually ship"
          hint="Be honest — this is where the real cost hides"
          value={videosMade} min={0} max={videosNeeded} onChange={setVideosMade}
        />
        <Slider
          label="Finished minutes per video"
          value={minutesEach} min={1} max={12} suffix="min" onChange={setMinutesEach}
        />
        <Slider
          label="External cost per finished minute"
          value={agencyRate} min={0} max={4000} step={100} suffix="USD" onChange={setAgencyRate}
        />
        <Slider
          label="Internal hours per video"
          hint="Scripting, recording, editing, revisions, publishing"
          value={internalHours} min={1} max={60} suffix="hrs" onChange={setInternalHours}
        />
        <Slider
          label="Fully loaded hourly cost"
          value={hourlyCost} min={30} max={250} step={5} suffix="USD" onChange={setHourlyCost}
        />
        <Slider
          label="Languages you publish in"
          value={languages} min={1} max={20} onChange={setLanguages}
        />
        <Slider
          label="Localization cost per video per language"
          value={localizationRate} min={0} max={4000} step={100} suffix="USD" onChange={setLocalizationRate}
        />
      </Card>

      {/* results */}
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-6">
            <p className="font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">Today</p>
            <p className="mt-3 text-[2.25rem] leading-none font-semibold tracking-[-0.03em] text-rose-400 tabular-nums">
              {usd(model.currentTotal)}
            </p>
            <p className="mt-2 text-[0.8125rem] text-fg-subtle">
              Annual spend to ship {model.made} of {videosNeeded} videos
            </p>
            <dl className="mt-5 space-y-2 border-t border-[var(--line)] pt-4 text-[0.8125rem]">
              <Row label="External production" value={usd(model.agencySpend)} />
              <Row label="Internal time" value={usd(model.internalSpend)} />
              <Row label="Localization" value={usd(model.localizationSpend)} />
            </dl>
          </Card>

          <Card className="border-iris-500/40 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-iris-500)_10%,transparent),transparent_60%)] p-6">
            <p className="font-mono text-2xs tracking-[0.14em] text-iris-300 uppercase">With DemoRiff</p>
            <p className="mt-3 text-[2.25rem] leading-none font-semibold tracking-[-0.03em] text-mint-400 tabular-nums">
              {usd(model.newTotal)}
            </p>
            <p className="mt-2 text-[0.8125rem] text-fg-subtle">
              Annual cost to ship all {videosNeeded}, in {languages} language{languages > 1 ? "s" : ""}
            </p>
            <dl className="mt-5 space-y-2 border-t border-[var(--line)] pt-4 text-[0.8125rem]">
              <Row label={`${model.plan.name} plan`} value={usd(model.planAnnual)} />
              <Row label="Your review time" value={usd(model.reviewSpend)} />
              <Row label="Localization" value="Included" tone="mint" />
            </dl>
          </Card>
        </div>

        <Card className="p-6 md:p-7">
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-[1.75rem] leading-none font-semibold tracking-[-0.03em] text-gradient tabular-nums">
                {model.savings > 0 ? usd(model.savings) : "—"}
              </p>
              <p className="mt-2 text-[0.8125rem] leading-snug text-fg-subtle">
                Removed from the annual budget
              </p>
            </div>
            <div>
              <p className="text-[1.75rem] leading-none font-semibold tracking-[-0.03em] text-gradient tabular-nums">
                {Math.max(0, Math.round(model.hoursSaved))} hrs
              </p>
              <p className="mt-2 text-[0.8125rem] leading-snug text-fg-subtle">
                Returned to your team each year
              </p>
            </div>
            <div>
              <p className="text-[1.75rem] leading-none font-semibold tracking-[-0.03em] text-gradient tabular-nums">
                {model.coverageBefore}% → 100%
              </p>
              <p className="mt-2 text-[0.8125rem] leading-snug text-fg-subtle">
                Of your roadmap covered by a video
              </p>
            </div>
          </div>
        </Card>

        {model.unmade > 0 ? (
          <Card className="flex items-start gap-3.5 border-amber-500/28 bg-amber-500/[0.05] p-6">
            <Icon name="alert" className="mt-0.5 size-[1.125rem] shrink-0 text-amber-400" strokeWidth={1.8} />
            <div>
              <p className="text-[0.9375rem] font-medium text-fg-strong">
                The invisible line: {model.unmade} videos you never made
              </p>
              <p className="mt-1.5 text-[0.875rem] leading-relaxed text-fg-muted">
                Producing those through your current arrangement would have cost a further{" "}
                <span className="font-medium text-amber-400">{usd(model.unmadeValue)}</span>, which
                is why they did not get made. That is not a budget line anywhere — it is the
                features that shipped without an explanation, and it is usually the largest cost of
                all.
              </p>
            </div>
          </Card>
        ) : null}

        <Card className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.875rem] text-fg-muted">
            {model.totalMinutes} finished minutes a year puts you on the{" "}
            <span className="font-medium text-fg-strong">{model.plan.name}</span> plan.
          </p>
          <div className="flex shrink-0 gap-2.5">
            <Button href="/signup" size="sm">Start free</Button>
            <Button href="/contact?topic=roi" variant="outline" size="sm">Get a written model</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "mint" }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className={cn("font-mono tabular-nums", tone === "mint" ? "text-mint-400" : "text-fg")}>{value}</dd>
    </div>
  );
}
