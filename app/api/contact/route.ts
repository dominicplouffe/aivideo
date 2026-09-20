import { NextResponse } from "next/server";

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

  // Delivery is intentionally not wired to a vendor in this repository.
  // In production this enqueues to the CRM and the notification channel.
  return NextResponse.json(
    {
      ok: true,
      received: {
        email: body.email,
        topic: body.topic ?? "demo",
        routedTo: body.topic === "security" ? "security@demoriff.com" : "sales@demoriff.com",
      },
      slaHours: body.topic === "security" ? 72 : 8,
    },
    { status: 202 },
  );
}
