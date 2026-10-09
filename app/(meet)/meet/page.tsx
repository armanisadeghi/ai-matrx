// app/(meet)/meet/page.tsx
//
// /meet with no slug is the meetings home. A person used to typing "meet" in the
// address bar lands on /meetings (signed-out visitors get its sign-in surface,
// see app/(core)/meetings/page.tsx) instead of a 404.

import { redirect } from "next/navigation";

export default function MeetIndexPage(): never {
  redirect("/meetings");
}
