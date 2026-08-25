# Public privacy policies

## Routes

- `/privacy-policy` covers the complete AI Matrx service.
- `/privacy-policy/extension` is the Chrome Web Store disclosure for Matrx Extend and supplements the complete policy.

## Extension-policy invariant

The extension policy must describe the exact current packaged manifest and fresh-install behavior. In particular, it must stay aligned with:

- required and optional Chrome permissions;
- whether automatic page capture is on or off by default;
- the Vault: how a website login can enter it (typed, the user-approved "Save this login?" prompt, agent-requested capture box), where it goes (Matrx backend, encrypted at rest, never to an AI model provider), and the user controls (Settings → Privacy toggle, per-site silence, view/edit/delete);
- which page data is processed locally, sent to AI Matrx, or sent to an AI provider;
- guest identity and retention behavior; and
- the Chrome Web Store privacy-form declarations.

Any Matrx Extend permission or privacy-default change updates this page in the same release. The canonical submission copy remains in `/Users/armanisadeghi/code/common-docs/systems/clients/extension/CHROME-WEB-STORE.md`.

## Change log

- 2026-08-22: Described the Vault tab — the three user-driven ways a website login is saved (typed, the "Save this login?" prompt after signing in to a site, the agent-requested capture box), HTTPS-only transport to the user's own Vault, encryption at rest, never to a model provider, fill only on the saved site on the user's click/approval, the Settings → Privacy toggle and per-site silence, and the local never-ask site list. No permission change.

- 2026-08-17: Aligned the extension policy with the required all-sites content bridge, opt-in automatic capture, action confirmation modes, and the complete packaged permission set.
