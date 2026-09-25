"use client";

import { useEffect } from "react";
import { toast } from "@/lib/toast";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";

export function GoogleOAuthRedirectNotice() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("google_oauth");
    if (status !== "connected" && status !== "failed") return;
    if (status === "connected") {
      toast.success("Google connected.");
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
