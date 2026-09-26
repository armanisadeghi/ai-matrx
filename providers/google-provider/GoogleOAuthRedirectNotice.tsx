"use client";

import { useEffect } from "react";
import { toast } from "@/lib/toast";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";

export function GoogleOAuthRedirectNotice() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("google_oauth");
    if (status !== "connected" && status !== "partial" && status !== "failed") return;
    if (status === "connected") {
      toast.success("Google connected.");
    } else if (status === "partial") {
      toast.warning(
        url.searchParams.get("google_oauth_message") ||
          "Google connected, but some products need attention. Review them in Settings → Connectors.",
      );
    } else {
      toast.error(
        url.searchParams.get("google_oauth_message") ||
          "Google authorization did not complete.",
      );
    }
    url.searchParams.delete("google_oauth");
    url.searchParams.delete("google_oauth_message");
    replaceAddressWithoutNavigating(url);
  }, []);
  return null;
}
