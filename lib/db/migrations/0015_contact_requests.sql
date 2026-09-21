-- Somewhere for the contact form to put a message.
--
-- The form previously waited 700ms and told the sender that somebody would
-- reply within one business day. Nothing was stored or routed anywhere, so
-- that was a promise with no mechanism behind it. A row here is the smallest
-- honest version of it: the message exists and somebody can read it.
CREATE TABLE IF NOT EXISTS "contact_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "company" text NOT NULL,
  "role" text,
  "topic" text DEFAULT 'demo' NOT NULL,
  "company_size" text,
  "message" text,
  "routed_to" text NOT NULL,
  "handled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_requests_created_idx" ON "contact_requests" USING btree ("created_at");
