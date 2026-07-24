"use client";

/**
 * Settings → Secrets — the personal principal of the Unified Credential
 * Vault. Renders the SAME `VaultWorkspace` the organization vault uses
 * (features/secrets/components/VaultWorkspace.tsx); the org surface lives
 * in OrgManage. See features/secrets/FEATURE.md.
 */
import { KeyRound } from "lucide-react";

import { VaultWorkspace } from "@/features/secrets/components/VaultWorkspace";

export default function SecretsSettingsPage() {
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-2xl font-bold md:text-3xl">
          <KeyRound className="h-7 w-7 text-primary" />
          Credentials
        </h1>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          Store a credential once — API keys, logins, tokens, service
          accounts — and every agent, sandbox, and integration acting on your
          behalf can use it. Values are encrypted at rest, masked in every
          listing, and only ever resolved inside trusted server operations.
        </p>
      </div>

      <VaultWorkspace principal={{ type: "user" }} />
    </div>
  );
}
