-- A voice you can hear before you choose it.
--
-- The studio library is imported from the synthesis vendor, and the vendor
-- publishes a short sample of every voice it offers. Keeping that link on the
-- row means the Voices page can play it on a click, at no cost, instead of
-- synthesizing a preview sentence per voice per visit.
ALTER TABLE "voices" ADD COLUMN IF NOT EXISTS "preview_url" text;
