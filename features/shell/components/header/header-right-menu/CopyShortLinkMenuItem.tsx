"use client";

import { Link as LinkIcon } from "lucide-react";
import { useCopyShortLink } from "@ai-matrx/kit/short-link-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { supabase } from "@/utils/supabase/client";
import { toast } from "@/lib/toast";
import { MENU_ITEM_CLASS } from "./menuItemClass";

/**
 * "Copy short link" — a short URL for THE CURRENT PAGE, query string and all,
 * so a sorted/filtered/configured view travels as ~30 characters instead of
 * hundreds. All the logic (the org-gated mint door, caching, clipboard) is
 * @ai-matrx/kit `useCopyShortLink`; this file is only the menu chrome. The
 * label closes the menu on click, so feedback goes through the toast.
 * Primitive SoR: common-docs/systems/platform/short-links/STATE.md.
 */
export function CopyShortLinkMenuItem() {
  const organizationId = useAppSelector(selectOrganizationId);
  const { copy } = useCopyShortLink(supabase, {
    organizationId: organizationId ?? "",
    onCopied: (url) => toast.success("Short link copied", { description: url }),
    onError: (error) => toast.error("Couldn't create a short link", { description: error }),
  });

  if (!organizationId) return null;

  return (
    <label htmlFor="shell-user-menu" className="block">
      <button className={MENU_ITEM_CLASS} onClick={copy}>
        <LinkIcon />
        Copy short link
      </button>
    </label>
  );
}
