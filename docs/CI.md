# Private canonical source, public verification

Private `StevenRidder/sv-itineris` owns code truth and merge provenance. Public
`StevenRidder/sv-itineris-ci` runs verification on the identical Git commit.
Source is intentionally visible in the CI repository. Private documents, photos,
exports, credentials and databases are excluded from both repositories.

The initial main commit bootstraps both repositories. Private Actions are
disabled; public workflows receive read-only permissions and no private token.
Main protection requires `sv-itineris-ci/gate` after bootstrap.

## Work loop

```sh
git switch -c codex/feature-name
# Make and verify the change, then commit it.
npm run check
python3 scripts/source_policy.py
git diff --check
git push -u origin HEAD
npm run ci:public
gh run list --repo StevenRidder/sv-itineris-ci --workflow verify.yml
# After the exact run completes successfully:
npm run ci:record -- RUN_ID
# Open the PR against the private canonical repository.
```

The helper refuses an uncommitted tree or forbidden tracked files. It pushes the
same SHA to `ci/SHA`, dispatches public verification, and marks canonical status
pending. Prove requires a successful workflow_dispatch run, matching repository,
workflow path, exact head SHA, successful jobs and identical tree. It then uses
the operator's existing local gh session to record the status. The public runner
never receives private-repository credentials.

For a merge or release candidate, run the same gate on that exact candidate SHA.
A PR-head result is not proof of a different merge commit. No application is
deployed by these workflows. CI evidence has no authority to activate navigation,
publish source documents or change external services.

CI installs locked dependencies, builds TypeScript, runs domain/API tests and
exercises the app in Chromium with synthetic source data. The receipt records
the tested commit and tree. Failed, cancelled, skipped or wrong-SHA runs cannot
create a green canonical status.
