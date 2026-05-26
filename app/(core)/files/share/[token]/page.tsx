/**
 * app/(a)/files/share/[token]/page.tsx
 *
 * Authenticated inbound share. A signed-in user clicks a `/share/:token` URL
 * that was issued from OUR app — we resolve the token against the table and
 * redirect to the file detail route so it opens inside the normal PageShell
 * (with full sidebar context, realtime updates, etc.).
 *
 * The public `/share/:token` route (app/(public)/share/[token]/page.tsx) is
 * the fallback when the visitor isn't authenticated.
 */

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function AuthedSharePage({ params }: PageProps) {
  const { token } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cld_share_links")
    .select(
      "resource_id, resource_type, is_active, expires_at, max_uses, use_count",
    )
    .eq("share_token", token)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) notFound();

  // Link invalid / expired / exhausted — bail to public resolver (which
  // renders a more descriptive "no longer valid" state).
  const expired = data.expires_at
    ? new Date(data.expires_at).getTime() < Date.now()
    : false;
  const exhausted = data.max_uses != null && data.use_count >= data.max_uses;
  if (expired || exhausted) {
    redirect(`/share/${encodeURIComponent(token)}`);
  }

  if (data.resource_type === "file") {
    redirect(`/files/f/${data.resource_id}`);
  }

  if (data.resource_type === "folder") {
    // Resolve folder id → path so the deep-link page can land there.
    const { data: folder } = await supabase
      .from("cld_folders")
      .select("folder_path")
      .eq("id", data.resource_id)
      .maybeSingle();
    const path = folder?.folder_path ?? "";
    redirect(`/files/${encodeURIComponent(path)}`);
  }

  notFound();
}
