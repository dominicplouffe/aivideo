-- Two new plans. Added on their own, before anything uses them: Postgres
-- refuses to use an enum value in the transaction that created it.
ALTER TYPE "public"."plan" ADD VALUE IF NOT EXISTS 'byok';
--> statement-breakpoint
ALTER TYPE "public"."plan" ADD VALUE IF NOT EXISTS 'studio';
--> statement-breakpoint
ALTER TYPE "public"."usage_kind" ADD VALUE IF NOT EXISTS 'ai';
