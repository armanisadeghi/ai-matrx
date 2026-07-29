// app/(core)/messages/page.tsx
//
// Server Component. The guest/authed branch lives in ../layout.tsx (guests
// get <MessagesLanding /> for /messages and every sub-route); by the time
// this page renders, the visitor is authenticated.

import MessagesPageClient from "./MessagesPageClient";

export default function MessagesPage() {
  return <MessagesPageClient />;
}
