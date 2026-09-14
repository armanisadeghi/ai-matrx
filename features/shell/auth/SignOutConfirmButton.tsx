"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialogHost } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { runSignOutFlow, type SignOutIdentity } from "./useSignOut";

/**
 * The button on /sign-out. Client-side on purpose: the sign-out must run in
 * the browser so the super-admin warnings can be asked and the device-scoped
 * sign-out clears THIS browser's cookie (a server action could only ever act
 * on the cookie it was handed, and used to do so globally).
 *
 * (auth-pages) renders OUTSIDE the app's Providers — no Redux store, no
 * ConfirmDialogHost — so the identity arrives as server-read props and this
 * component mounts its own confirm host.
 */
export function SignOutConfirmButton({ identity }: { identity: SignOutIdentity }) {
  const [pending, setPending] = useState(false);
  return (
    <>
      <ConfirmDialogHost />
      <Button
        type="button"
        variant="destructive"
        className="w-full gap-2"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            const done = await runSignOutFlow(identity);
            if (!done) setPending(false);
          } catch (error) {
            setPending(false);
            throw error;
          }
        }}
      >
        <LogOut className="h-4 w-4" />
        {pending ? "Signing out…" : "Sign Out"}
      </Button>
    </>
  );
}
