"use client";

import { useEffect } from "react";
import { toast } from "@/lib/toast";

export function GoogleOAuthRedirectNotice() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("google_oauth");
    if (status !== "connected" && status !== "failed") return;
    if (status === "connected") {
      toast.success("Google connected. Choose Google Drive again to continue.");
    } else {
      toast.error(
        url.searchParams.get("google_oauth_message") ||
          "Google authorization did not complete.",
      );
    }
    url.searchParams.delete("google_oauth");
    url.searchParams.delete("google_oauth_message");
    window.history.replaceState(window.history.state, "", url);
  }, []);
  return null;
}
