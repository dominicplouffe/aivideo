-- A studio voice the vendor has stopped offering.
--
-- Deleting the row would null out every project that chose it, silently
-- reverting those renders to the recorded voice. Leaving it selectable would
-- let a new project choose a voice that fails at the vendor. So it stays,
-- marked unavailable: shown to the projects that already have it, offered
-- to nobody else, and refused with a reason at render time.
ALTER TABLE "voices" ADD COLUMN IF NOT EXISTS "available" boolean NOT NULL DEFAULT true;
