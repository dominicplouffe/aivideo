-- A project whose transcription died needs a state that is not "still working".
--
-- Without this, a failed import sat in `processing` forever: the library
-- showed a spinner, the Studio showed an empty transcript, and nothing
-- anywhere said the job had already given up. `failed` is what lets the
-- library offer a retry instead of a spinner.
ALTER TYPE "public"."project_status" ADD VALUE IF NOT EXISTS 'failed';
