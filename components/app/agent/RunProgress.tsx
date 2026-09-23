"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { SHOW_OPERATOR_HINTS, WORKER_COMMAND } from "@/lib/ops";

/**
 * While a run is waiting or recording, the page says which, in the
 * person's terms, and keeps itself current. Polls the run every few
 * seconds: a run takes a minute or two and the page is open for exactly
 * that long.
 *
 * A wait is described by what the person can see — how long it has been
 * in line and how much is ahead of it — never by the process that serves
 * the line, which is not theirs to start. That sentence is kept for local
 * development, where the reader is the one who can start it.
 */
export function RunProgress({ runId, status }: { runId: string; status: string }) {
  const router = useRouter();
  const [queue, setQueue] = useState<{ queued_at: string; ahead: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = async () => {
      setNow(Date.now());
      try {
        const response = await fetch(`/api/agent/runs?id=${runId}`);
        const body = (await response.json()) as { run?: { status?: string }; queue?: { queued_at: string; ahead: number } | null };
        setQueue(body.queue ?? null);
        if (body.run?.status && body.run.status !== status) router.refresh();
      } catch {
        // Try again on the next tick.
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 3000);
    return () => clearInterval(timer);
  }, [runId, status, router]);

  const recording = status === "recording";
  const waitedSec = queue ? Math.max(0, (now - new Date(queue.queued_at).getTime()) / 1000) : 0;
  const long = !recording && waitedSec > 90;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-iris-500/30 bg-iris-500/[0.07] px-4 py-3.5">
      <span className="mt-1 size-2 shrink-0 animate-pulse rounded-full bg-iris-400" />
      <div className="min-w-0 flex-1 text-[0.8125rem] leading-relaxed text-fg">
        <p className="font-medium text-fg-strong">
          {recording
            ? "Recording now"
            : queue && queue.ahead > 0
              ? `In line · ${queue.ahead} ${queue.ahead === 1 ? "job" : "jobs"} ahead`
              : "Starting shortly"}
        </p>
        <p className="mt-0.5 text-fg-subtle">
          {recording
            ? "A browser is following the approved steps and recording the screen. Each action appears in the trail below as it happens."
            : long
              ? `This has been waiting ${Math.round(waitedSec / 60) || 1} min, longer than usual. It will start on its own; you can leave this page and come back.`
              : "It starts on its own as soon as the recorder is free. You can leave this page; the run keeps going."}
          {" "}This page updates by itself.
        </p>
        {long && SHOW_OPERATOR_HINTS ? (
          <p className="mt-1.5 text-2xs text-fg-faint">
            Developing locally? Agent runs are recorded by the background worker: start it with{" "}
            <code className="font-mono text-fg-subtle">{WORKER_COMMAND}</code>.
          </p>
        ) : null}
      </div>
      <Icon name="record" className="mt-0.5 size-4 shrink-0 text-iris-300" strokeWidth={1.8} />
    </div>
  );
}
