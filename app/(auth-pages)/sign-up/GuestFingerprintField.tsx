"use client";

// Injects the visitor's guest fingerprint into the sign-up form so the
// server action can promote their anonymous account in place (preserving
// all files/conversations they created as a guest). Renders nothing visible.
//
// If fingerprinting fails or the visitor was never a guest, the field stays
// empty and the server action falls straight through to a normal sign-up.

import { useEffect, useRef } from "react";
import { getFingerprint } from "@/lib/services/fingerprint-service";

export function GuestFingerprintField() {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    getFingerprint()
      .then((fp) => {
        if (active && ref.current) ref.current.value = fp;
      })
      .catch(() => {
        // No fingerprint → no promotion → normal sign-up. Non-fatal.
      });
    return () => {
      active = false;
    };
  }, []);

  return <input ref={ref} type="hidden" name="guestFingerprint" defaultValue="" />;
}
