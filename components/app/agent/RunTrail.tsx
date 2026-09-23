import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { FixtureAction } from "@/lib/agent/fixtures";

/**
 * The run audit, as a screen.
 *
 * Refusals are rendered alongside actions rather than tucked into a tab,
 * because "what did it try to do" is the question this page exists to
 * answer. A trail that hides them reads as a clean run, which is exactly the
 * impression that would be wrong.
 */
const KIND: Record<string, { icon: IconName; label: string }> = {
  navigate: { icon: "link", label: "Navigated" },
  click: { icon: "cursor", label: "Clicked" },
  type: { icon: "caption", label: "Typed" },
  select: { icon: "list", label: "Selected" },
  scroll: { icon: "dragHandle", label: "Scrolled" },
  wait: { icon: "clock", label: "Waited" },
  assert: { icon: "check", label: "Checked" },
  screenshot: { icon: "frame", label: "Captured" },
  refused: { icon: "shield", label: "Refused" },
};

function timestamp(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function RunTrail({ actions }: { actions: FixtureAction[] }) {
  if (actions.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-[0.875rem] text-fg-subtle">
        Nothing has run yet. The trail fills in as the agent works, and it keeps
        every refusal alongside every action.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-[var(--line)]">
      {actions.map((action) => {
        const meta = KIND[action.kind] ?? KIND.assert;
        const refused = action.kind === "refused" || Boolean(action.refusedReason);

        return (
          <li key={action.ordinal} className="flex gap-3 px-5 py-3.5">
            <span className="w-10 shrink-0 pt-0.5 font-mono text-2xs text-fg-faint">
              {timestamp(action.atMs)}
            </span>
            <span
              className={cn(
                "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg border",
                refused
                  ? "border-rose-500/35 bg-rose-500/10 text-rose-400"
                  : "border-[var(--line)] bg-ink-900 text-fg-subtle",
              )}
            >
              <Icon name={meta.icon} className="size-3.5" strokeWidth={1.9} />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[0.8125rem] text-fg">
                <span className={cn("font-medium", refused ? "text-rose-400" : "text-fg-strong")}>
                  {meta.label}
                </span>
                {action.target ? <span className="text-fg-subtle"> · {action.target}</span> : null}
                {typeof action.outlineOrdinal === "number" ? (
                  <span className="text-fg-faint"> · step {action.outlineOrdinal + 1}</span>
                ) : null}
              </p>

              {action.url ? (
                <p className="mt-0.5 truncate font-mono text-2xs text-fg-faint">{action.url}</p>
              ) : null}

              {action.refusedReason ? (
                <p className="mt-1 text-2xs leading-relaxed text-rose-400/90">{action.refusedReason}</p>
              ) : null}

              {action.detail?.value !== undefined && !action.detail?.credential ? (
                <p className="mt-1 text-2xs text-fg-faint">
                  Typed <span className="font-mono text-fg-subtle">“{String(action.detail.value)}”</span>
                </p>
              ) : null}

              {action.detail?.credential ? (
                <p className="mt-1 text-2xs text-fg-faint">
                  Credential <span className="text-fg-subtle">{String(action.detail.credential)}</span>
                  {action.detail.username ? (
                    <> as <span className="text-fg-subtle">{String(action.detail.username)}</span></>
                  ) : null}
                  {/* Stated on the screen as well as enforced in the code. */}
                  {" "}— the value typed is never recorded.
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
