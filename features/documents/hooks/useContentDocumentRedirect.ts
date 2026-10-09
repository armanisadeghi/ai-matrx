"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabase/client";
import { documentHref } from "@/features/scopes/registry/entityRegistry";

/**
 * `/documents/[id]` is the Univer editor (`workbench.udt_documents`). A
 * `content.document` id (markdown, working document, scratchpad, Space) that
 * reaches it through a generic link — the share registry's `/documents/{id}`
 * template, an old reference, a notification — belongs in ITS editor:
 * `documentHref` (Markdown Studio, or `/spaces/<id>` for a Space).
 *
 * Returns the door when the id is a content-store document (the page replaces
 * itself with it), null when it is not (a Univer document, or not found).
 */
export async function contentDocumentDoor(
  id: string,
  read: (id: string) => Promise<{ format: string | null } | null> = readContentDocumentFormat,
): Promise<string | null> {
  const row = await read(id);
  return row ? documentHref(id, row.format) : null;
}

async function readContentDocumentFormat(
  id: string,
): Promise<{ format: string | null } | null> {
  const { data, error } = await supabase
    .schema("content")
    .from("document")
    .select("format")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    // Said, never swallowed: the Univer page still renders its own state.
    console.error("[documents] content-document door lookup failed", { id, error });
    return null;
  }
  return data ?? null;
}

/**
 * Replace `/documents/<id>` with the content-store door when the id is one.
 * `"checking"` until the lookup answers (the page renders nothing yet, so a
 * content-store id never flashes the Univer editor's not-found), then the door
 * being navigated to, or null for a Univer document.
 */
export function useContentDocumentRedirect(id: string): string | "checking" | null {
  const router = useRouter();
  const [door, setDoor] = useState<{ id: string; href: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    void contentDocumentDoor(id).then((href) => {
      if (!live) return;
      setDoor({ id, href });
      if (href) router.replace(href);
    });
    return () => {
      live = false;
    };
  }, [id, router]);
  if (!door || door.id !== id) return "checking";
  return door.href;
}
