import { cookies } from "next/headers";
import type { Layout } from "react-resizable-panels";

// Server-side cookie → Layout map. Returns undefined when the cookie is absent
// or unparseable so the page falls back to each Panel's defaultSize.
export async function readLayoutCookie(
  cookieName: string,
): Promise<Layout | undefined> {
  const store = await cookies();
  const raw = store.get(cookieName)?.value;
  if (!raw) return undefined;
  try {
    return JSON.parse(decodeURIComponent(raw)) as Layout;
  } catch {
    return undefined;
  }
}

// Same shape, generic JSON read — used for non-Layout state cookies (e.g. the
// "which panels are mounted" toggle state in the conditional-panels demo).
export async function readJsonCookie<T>(cookieName: string): Promise<T | undefined> {
  const store = await cookies();
  const raw = store.get(cookieName)?.value;
  if (!raw) return undefined;
  try {
    return JSON.parse(decodeURIComponent(raw)) as T;
  } catch {
    return undefined;
  }
}
