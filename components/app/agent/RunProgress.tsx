"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/**
 * While the worker is on the run, the page says so and keeps itself
 * current. Polling the run rather than pushing: a run takes a minute or
 * two, the page is open for exactly that long, and one request every few
 * seconds is cheaper than a socket nobody else needs.
 */
export function RunProgress({ runId, status }: { runId: string; status: string }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/agent/runs?id=${runId}`);
        const body = (await response.json()) as { run?: { status?: string } };
        if (body.run?.status && body.run.status !== status) router.refresh();
      } catch {
        // Try again on the next tick.
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [runId, status, router]);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-iris-500/30 bg-iris-500/[0.07] px-4 py-3.5">
      <span className="mt-1 size-2 shrink-0 animate-pulse rounded-full bg-iris-400" />
      <div className="text-[0.8125rem] leading-relaxed text-fg">
        <p className="font-medium text-fg-strong">{status === "recording" ? "Recording now" : "Queued for the worker"}</p>
        <p className="mt-0.5 text-fg-subtle">
          {status === "recording"
            ? "A browser is following the approved steps and recording the screen. Each action is written to the trail below as it happens."
            : "The render worker picks up approved runs in order. If nothing happens for a minute, check that a worker is running."}
          {" "}This page updates by itself when the run finishes.
        </p>
      </div>
      <Icon name="record" className="mt-0.5 size-4 shrink-0 text-iris-300" strokeWidth={1.8} />
    </div>
  );
}
