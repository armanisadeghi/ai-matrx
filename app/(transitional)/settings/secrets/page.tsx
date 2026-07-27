"use client";

/**
 * Settings → Vault — the personal principal of the Vault. Renders the SAME
 * `VaultWorkspace` the `/vault` route and the organization surface use
 * (features/secrets/components/VaultWorkspace.tsx). The primary home is
 * `/vault`; this stays as the settings-shaped entry. See
 * features/secrets/FEATURE.md.
 */
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { VaultWorkspace } from "@/features/secrets/components/VaultWorkspace";

export default function SecretsSettingsPage() {
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-2xl font-bold md:text-3xl">
          <ShieldCheck className="h-7 w-7 text-primary" />
          Vault
        </h1>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          Every login, API key, and token the platform signs in with. Save it
          once and every agent, sandbox, and integration acting on your behalf
          can use it — values stay encrypted at rest, masked in every listing,
          and are only ever resolved inside trusted server operations.{" "}
          <Link href="/vault" className="text-primary underline-offset-4 hover:underline">
            Open the full Vault
          </Link>
          .
        </p>
      </div>

      <VaultWorkspace principal={{ type: "user" }} />
    </div>
  );
}
