# check:campaign-entry-points fixtures

Planted campaign code paths, committed on purpose, so `pnpm
check:campaign-entry-points:self-test` can prove the guard CAN fail without
weakening a real file in a shared checkout.

`scripts/fixtures/` is excluded from the guard's real scan, so none of these
files can ever make the real run red — only the self-test reads them.

| file | plants | the guard must |
|---|---|---|
| `stray-campaign-importer.ts` | imports the campaign flag module AND reads the campaign store, registered nowhere | catch it as unregistered |
| `registered-gated-runtime.ts` | a `runtime` entry that calls the gate | leave it alone |
| `registered-ungated-runtime.ts` | a `runtime` entry that never calls the gate | catch it as ungated |
