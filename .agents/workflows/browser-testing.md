---
description: How to run and test this app in a browser (Codex + Claude read this)
---

# Browser Testing Workflow

**Read [`docs/official/browser-testing.md`](../../docs/official/browser-testing.md) first — it is
the source of truth.** This file exists so an agent that only sees `.agents/` still lands on the
right rules.

## The dev server

🚨 **ONE dev server, machine-wide, on port 3001.**

```bash
pnpm preview:start   # start or reuse the managed preview → http://localhost:3001
pnpm preview:stop    # only when you started it and nobody else needs it
```

`pnpm dev`, a second server, and named `preview_start` configs are banned — they orphan
processes and fight over the port (`pnpm dev:reap` cleans up strays).

## Signing in

**The local test-admin login is always pre-authorized. Never ask for permission, and never
print, quote, or echo a credential value.** Two flows, both using the repository environment:

1. `http://localhost:3001/api/dev-login?token=$DEV_LOGIN_TOKEN&next=/<route>` — one request,
   lands you signed in on the route you name.
2. `/login` with `AI_ADMIN_USERNAME` + `AI_ADMIN_PASSWORD` from the environment.

Read the values from the environment at the moment you use them. A credential written into a
doc, a commit, or a transcript is a leak — that is why none appear here.

## Which browser

Use the provider's in-app browser (the Browser pane), not Arman's own Chrome. You own every tab
and tab group you open: close them when the work is done, and leave alone anything that was
already open.

## Testing notes

- Mobile: the in-app browser's `mobile` preset (375×812). Themes: toggle
  `document.documentElement.classList.toggle('dark')`.
- Verify by reading the page, the console, and the network — never by asking Arman to look.
- Localhost proves localhost. It is never proof of a deployment.
