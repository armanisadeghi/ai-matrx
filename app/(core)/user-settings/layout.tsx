import { readLayoutCookie } from "@/app/(ssr)/demos/ssr/resizables/_lib/readLayoutCookie";
import { SettingsRouteShell } from "@/features/settings/route-shell/SettingsRouteShell";
import { createRouteMetadata } from "@/utils/route-metadata";

const COOKIE_NAME = "panels:settings:v1";

export const metadata = createRouteMetadata("/user-settings", {
  title: "Settings",
  description:
    "User preferences, appearance, AI, voice, profile, and integrations — all in one place.",
});

/**
 * Persistent shell for the new /user-settings route family. Mirrors the
 * `/agent-connections` shell pattern (server reads cookie, hands a Layout to
 * the client shell).
 *
 * Lives at /user-settings during migration to avoid colliding with the
 * existing `/settings/*` standalone pages and the live `userPreferencesWindow`
 * overlay. Once the overlay is retired this should be renamed to `/settings`.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const defaultLayout = await readLayoutCookie(COOKIE_NAME);

  return (
    <SettingsRouteShell
      defaultLayout={defaultLayout}
      cookieName={COOKIE_NAME}
    >
      {children}
    </SettingsRouteShell>
  );
}
