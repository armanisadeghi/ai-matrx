// app/(core)/me/access-log/layout.tsx
//
// 🚨 THIS PATH IS LOAD-BEARING. `public.hr_break_glass` and
// `public.org_admin_take_over_account` write `/me/access-log` into every
// notification they send the person whose data or account was opened. Renaming or moving this route
// breaks those links silently, in the one place the platform promises never to
// be silent. Change the database's deep link first, or not at all.

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/me/access-log", {
  titlePrefix: "Who Opened My Data",
  title: "My Record",
  description:
    "Every time anyone opened your data, or was refused when they tried.",
  letter: "AL",
});

export default function AccessLogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
