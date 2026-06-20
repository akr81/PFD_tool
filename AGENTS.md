# AGENTS.md

## Required Checks

When code changes are made, run the required regression suite before finishing:

- `npm test`

If the full suite cannot be run, report the reason and the remaining risk in the final response.

## Change-Specific Checks

- CCPM, date calculation, resource constraints, buffers, baselines, or fever chart changes require CCPM regression tests to be added or updated.
- Goal Navi progress, velocity, estimated finish, or buffer consumption changes require Goal Navi regression tests to be added or updated.
- JSON, SVG, PNG, or localStorage persistence changes require round-trip tests to be added or updated.
- UI workflow changes require Playwright E2E tests when the behavior is user-visible.

## Test Policy

New features should add at least one of the following:

- A logic/regression test for calculation, normalization, scheduling, or persistence.
- An E2E test for a user-facing workflow.

If an expected value from a bundled sample changes, treat it as a specification change and document the reason in the relevant test or change summary.
