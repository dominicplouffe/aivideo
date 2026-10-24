CREATE TABLE "checkout_starts" (
	"stripe_session_id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid,
	"plan" text NOT NULL,
	"packs" integer DEFAULT 0 NOT NULL,
	"first_touch" jsonb,
	"status" text DEFAULT 'started' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "first_touch" jsonb;--> statement-breakpoint
ALTER TABLE "checkout_starts" ADD CONSTRAINT "checkout_starts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkout_starts_workspace_idx" ON "checkout_starts" USING btree ("workspace_id","created_at");