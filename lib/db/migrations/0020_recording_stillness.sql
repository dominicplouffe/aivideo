-- Where a recording's picture stands still.
--
-- Measured once when a take is processed, so a narrated render can hold or
-- hurry the footage where nothing is moving and leave the motion alone.
ALTER TABLE "recordings" ADD COLUMN IF NOT EXISTS "stillness" jsonb;
