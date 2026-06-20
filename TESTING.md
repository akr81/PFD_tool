# Testing

This project uses Playwright for both browser-level logic checks and user-facing E2E checks. The app is a single-file browser tool, so tests load `index.html?test=1` and use a test-only API exposed by the page.

## Commands

```powershell
npm test
npm run test:logic
npm run test:e2e
```

Use `npm.cmd` instead of `npm` in PowerShell if script execution policy blocks `npm.ps1`.

## Test Layers

- `tests/logic`: calculation, normalization, scheduling, and persistence helpers.
- `tests/regression`: bundled sample JSON and export metadata regression checks.
- `tests/e2e`: small set of user-facing browser workflows.

## Adding Tests

- Add logic tests for pure calculations and saved data shape.
- Add regression tests when sample graphs or exported metadata should keep stable behavior.
- Add E2E tests only for important user workflows, because they are slower and more sensitive to layout details.

The test-only API is exposed only when the URL contains `?test=1`.
