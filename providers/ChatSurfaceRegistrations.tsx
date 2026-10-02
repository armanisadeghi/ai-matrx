"use client";
// providers/ChatSurfaceRegistrations.tsx
//
// Browser half of the app's `@ai-matrx/chat` surface registrations (P19): the
// import below runs the registration when this client module loads, before
// any package component renders. Mounted once in `app/Providers.tsx`, beside
// `ChatHostAdapter`. Renders nothing.
import "@/providers/chat-surface-manifests";

export function ChatSurfaceRegistrations(): null {
  return null;
}
