import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/meetings", {
  title: "Meetings",
  description:
    "Schedule, manage and join your meetings — recurring series, guests and RSVPs, and the record of every meeting",
  letter: "MG",
  additionalMetadata: {
    keywords: ["meetings", "video call", "conference", "meeting link"],
  },
});

/**
 * No body-level wrapper — the page owns the shell's full-height area, like
 * `(core)/tasks`. `/meetings` is where meetings are MANAGED; the meeting itself
 * lives at `/meet/<slug>` in the chrome-free `(meet)` group, because a stage
 * has no room for `AppShell`.
 */
export default function MeetingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
