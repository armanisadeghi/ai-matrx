# Extension API

`POST /api/extension/append-message` is the authenticated HTTP entry point for
an extension service worker to append a message to an existing `chat.conversation`.
The wire schemas live in `lib/types/bridge-envelope.ts`; do not redefine them
inside a route or demo.

## Authentication

The route supports two user-scoped modes, in this order:

1. The normal AI Matrx Supabase session cookie.
2. `Authorization: Bearer <Supabase access token>` for the extension service
   worker, which has no site cookie.

Bearer mode is not a deployment API key. It validates the access token with
Supabase Auth and performs the conversation lookup, position lookup, and
message insert through the same bearer-scoped client. Existing RLS therefore
decides which conversation the caller may read or mutate. Never replace this
with an admin client or a global shared secret.

## Data path

The route validates with `AppendMessageRequestSchema`, confirms the
conversation exists, computes the next message position, normalizes string
content to a text block, and delegates the insert to `createCxMessage`.
`getCxConversation` and `createCxMessage` accept an optional database client so
routes with explicit caller credentials can preserve that exact RLS context;
callers without one retain the ordinary cookie-client behavior.

The production demo at `/demos/tests/extension-bridge` can exercise cookie and
Bearer modes. Bearer mode takes the signed-in user's access token in memory,
omits browser cookies, and never displays or persists the token.
