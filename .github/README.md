# CI

`workflows/ci.yml` typechecks and builds. It does not run the tests.

`ci-with-tests.yml` in this directory is the same file with a `test` job
added, which is what should be running: Postgres 16 as a service, ffmpeg
installed, migrations applied without seeding, then `npm test` (542 unit
tests) and `scripts/test-env.sh` (16 end-to-end tests covering signup through
publishing to analytics).

It is sitting here rather than in `workflows/` because the token that pushed
this branch has no `workflow` scope, and GitHub refuses any commit touching
`.github/workflows/` without it. Both `git push` and the REST API were
refused. To apply it:

```bash
mv .github/ci-with-tests.yml .github/workflows/ci.yml
rm .github/README.md
git commit -am "Run the tests in CI"
```

Two things in that job are deliberate and worth keeping:

- **ffmpeg is installed, not skipped.** The render tests assert on a real
  encoded file with `ffprobe`. A job that skipped them would go green while
  rendering was broken.
- **There is no `db:seed` step.** The end-to-end suite creates its own
  workspaces through the real signup route, because a workspace created
  seconds ago is the state those tests exist to check.
