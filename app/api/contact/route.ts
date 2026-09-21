import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import { contactRequests } from "@/lib/db/schema";

interface ContactPayload {
  email?: string;
  name?: string;
  company?: string;
  role?: string;
  topic?: string;
  size?: string;
  message?: string;
}

const TOPICS = new Set(["demo", "pricing", "security", "roi", "migration", "partners", "other"]);

export async function POST(request: Request) {
  let body: ContactPayload;
  try {
    body = (await request.json()) as ContactPayload;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const errors: Record<string, string> = {};
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email)) {
    errors.email = "A valid work email is required.";
  }
  if (!body.name || body.name.trim().length < 2) errors.name = "Name is required.";
  if (!body.company || body.company.trim().length < 2) errors.company = "Company is required.";
  if (body.topic && !TOPICS.has(body.topic)) errors.topic = "Unknown topic.";
  if (body.message && body.message.length > 4000) errors.message = "Message is too long.";

  if (Object.keys(errors).length) {
    return NextResponse.json({ error: "Validation failed", fields: errors }, { status: 422 });
  }

  const topic = body.topic ?? "demo";
  const routedTo = topic === "security" ? "security@demoriff.com" : "sales@demoriff.com";

  // Stored, not just validated. There is still no mail vendor wired up here
  // — that belongs to a deployment, not to this repository — but a message
  // that lands in a table is a message somebody can answer, and that is the
  // difference between a queue and a promise nobody can keep.
  let stored = false;
  if (isDatabaseConfigured()) {
    try {
      await getDb().insert(contactRequests).values({
        email: body.email!.trim().toLowerCase(),
        name: body.name!.trim(),
        company: body.company!.trim(),
        role: body.role?.trim() || null,
        topic,
        companySize: body.size?.trim() || null,
        message: body.message?.trim() || null,
        routedTo,
      });
      stored = true;
    } catch (error) {
      // Reported rather than swallowed. A form that says "sent" over a
      // failed write is the bug this whole endpoint was rewritten to stop.
      console.error("[contact] could not store the enquiry:", error);
      return NextResponse.json(
        { error: "We could not record that message. Please email us directly." },
        { status: 503 },
      );
    }
  }

  return NextResponse.json(
    {
      ok: true,
      // False when the deployment has no database. The form says something
      // different in that case, because "we have your message" would not be
      // true.
      stored,
      received: { email: body.email, topic, routedTo },
      slaHours: topic === "security" ? 72 : 8,
    },
    { status: 202 },
  );
}
