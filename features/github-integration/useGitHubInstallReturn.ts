"use client";

import { useCallback, useEffect, useRef } from "react";
import { GITHUB_APP_INSTALL_URL } from "./service";

/**
 * "Add an organization or more repositories" leaves AI Matrx entirely: the user
 * finishes the work on github.com and comes back to a tab that still holds the
 * OLD inventory. Without this they would see the same missing repositories and
 * conclude the platform is broken — the exact dead end Arman hit.
 *
 * So: opening the installation page ARMS a single refresh, and the first time
 * this tab regains focus we run it once and disarm. Once, not on every focus —
 * a re-sync hits the GitHub API through aidream, and an unarmed refresh on
 * every tab switch would be a silent background storm nobody asked for.
 */
export function useGitHubInstallReturn(onReturn: () => void | Promise<void>) {
  const armed = useRef(false);
  const handler = useRef(onReturn);
  // Assigned in an effect, never during render (react-hooks/refs): the focus
  // listener below only reads it after paint, so it is always current by then.
  useEffect(() => {
    handler.current = onReturn;
  });

  useEffect(() => {
    const run = () => {
      if (!armed.current) return;
      armed.current = false;
      void handler.current();
    };
    window.addEventListener("focus", run);
    return () => window.removeEventListener("focus", run);
  }, []);

  const openInstallPage = useCallback(() => {
    armed.current = true;
    window.open(GITHUB_APP_INSTALL_URL, "_blank", "noopener,noreferrer");
  }, []);

  return { openInstallPage };
}
