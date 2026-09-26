# Action requests — the `/q/<token>` page

**Status:** live · **Route:** `app/(link)/q/[token]/` · **Doors:**
[`service.ts`](./service.ts) · **Logic owner:** `aidream`

An agent parks its turn and asks the person it works for for ONE thing. They get
a text with a one-tap link, answer on `/q/<token>`, and the parked turn resumes
by itself. This folder is the app's whole half of it.

## What the page is

One ask, one answer, on a phone. `approve`, `choose_one`, `confirm_details`,
`pick_time`, `credential`, `browser_takeover`, `one_time_code`, `vault_item` — the form is whichever one the
server's render spec names.

## The in-chat twin (2026-09-26)

The same ask, answered where the person already is. When the chat renders an
`ask_person` tool call, `AskPersonInline`
(`features/tool-call-visualization/renderers/ask-person/`) finds the ask in
aidream's authenticated `GET /action-requests/pending` (by the parked output's
`action_request_id`, else this conversation + the kind) and draws the SAME form.
The answer goes to `POST /action-requests/{id}/complete` with the person's own
session — no token anywhere ([`self-service.ts`](./self-service.ts)). Not in the
list = not open: one quiet line, never a dead form.

- **One form, two doors:** [`components/ActionRequestAnswerForm.tsx`](./components/ActionRequestAnswerForm.tsx)
  owns every `render.form` (incl. `vault_item`, kind `vault_capture`: a field
  list with no origin line and no origin echo) and the shared outcome reader
  `useActionRequestAnswer`. The `/q` page and the chat card only supply the
  transport.

## What it is NOT

- **Not a `(core)` page.** It is in `(link)`, the group for a link somebody was
  SENT. No AppShell, no sidebar, no Canvas, no marketing header or footer.
- **Not a place that decides anything.** It grants nothing, derives nothing,
  and refuses nothing on its own.
- **Not a browser caller.** All three doors are reached from the server lane
  only (`import "server-only"`), because forwarding the person's
  `Authorization: Bearer …` header is what separates a signed-in completion
  from a bearer one — and that decision belongs where the session cookie is.

## Where the logic lives

`aidream`, in `aidream/services/action_requests/` behind
`aidream/api/routers/action_requests.py`: the kind registry, the consequence
classes, the exactly-once claim, the expiry and re-mint rate limits, the vault
write, the origin check, and every sentence a person reads. Three endpoints on
the public router at the bare prefix — `/action-requests/open`, `/complete`,
`/remint` — named once in `lib/api/endpoints.ts` under `ENDPOINTS.actionRequests`.

## The one rule

🚨 **The render spec is the server's and is never re-derived here.** `open`
answers `render` (the whole form, already written) and `can_complete` (the whole
session decision, already resolved against the kind's consequence class and the
organization's knob). Nothing in this feature switches on `kind`. A second copy
of that registry in TypeScript would one day disagree with the first, and on a
credential form the disagreement would be a page that let somebody in.

Two corollaries that follow from it, and are load-bearing:

- **Sentences are carried verbatim.** A refusal's `message` and `remedy` are
  aidream's own words. Paraphrasing one leaves a person staring at a form with
  no idea what to do.
- **`origin` is the SITE, not us.** The echo the page sends back is the origin
  from the render spec — the site the agent is signing into. aidream compares it
  to the origin on the row exactly; this app's own origin would match nothing.

## Known gap

`upload_file` has no door. aidream's result for it is a list of file ids, and
every byte store this app can reach needs the uploader's own session, which a
link visitor does not have. The runner shows the ask and says plainly that files
cannot be sent from the link yet — it does not draw a picker that would fail at
the end.
