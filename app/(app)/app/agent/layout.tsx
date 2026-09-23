import { notFound } from "next/navigation";
import { debugEnabled } from "@/lib/debug";

/** The Riff Agent is behind debug mode (⌘/) until it has had a proper design pass. */
export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  if (!(await debugEnabled())) notFound();
  return children;
}
