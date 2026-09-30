"use client";

/**
 * The Google connect dialog, rendered in the exact frame the product ships
 * (`ConnectorConsentShell` + `ConnectorConsentBody`) against a realistic
 * account: Docs and Gmail sending already granted, Gmail reading and Gmail
 * changes still behind Google's review. Used for design review and screenshots.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ConnectorConsentBody,
  ConnectorConsentShell,
} from "@/features/connectors/ConnectorConsentDialog";
import { GOOGLE_CONNECTOR_PROVIDER } from "@/features/connectors/provider-config";
import type {
  ConnectorAccount,
  ConnectorCapabilityRollout,
} from "@/features/connectors/health";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";

const provider = GOOGLE_CONNECTOR_PROVIDER;
const UNDER_REVIEW = new Set(["gmail_read", "gmail_modify"]);

const ROLLOUT: ConnectorCapabilityRollout[] = [
  ...new Set(provider.products.flatMap((product) => product.capabilityKeys)),
].map((capabilityKey) => {
  const pending = UNDER_REVIEW.has(capabilityKey);
  return {
    capabilityKey,
    phase: pending ? ("pending" as const) : ("available" as const),
    eligible: !pending,
    requiredScopes: [],
    ineligibleReason: pending ? "Turns on automatically when Google finishes its review." : null,
  };
});

const ACCOUNT: ConnectorAccount = {
  id: "demo-account",
  label: "maya@sunriseclinic.com",
  ownerKind: "person",
  organizationId: null,
  providerSubject: "demo-sub",
  grantedScopes: [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/gmail.send",
  ],
  usable: true,
  statusLabel: "Connected",
  statusReason: "This account can authorize Google calls.",
  statusRemedy: null,
  lastVerifiedAt: new Date().toISOString(),
  lastRefusalSentence: null,
};

export default function GoogleConnectDemoPage() {
  const [open, setOpen] = useState(true);
  const [fresh, setFresh] = useState(false);
  return (
    <div className="flex h-full items-center justify-center gap-3 bg-textured p-6">
      <Button onClick={() => { setFresh(false); setOpen(true); }}>Open (connected account)</Button>
      <Button variant="outline" onClick={() => { setFresh(true); setOpen(true); }}>Open (first connection)</Button>
      <ConnectorConsentShell provider={provider} isOpen={open} onClose={() => setOpen(false)}>
        <LazyGoogleAPIProvider>
          <ConnectorConsentBody
            key={fresh ? "fresh" : "connected"}
            provider={provider}
            accounts={fresh ? [] : [ACCOUNT]}
            rollout={ROLLOUT}
            isLoading={false}
            rolloutUnavailable={false}
            errorMessage={null}
            refetch={async () => {}}
            initialProductKeys={fresh ? ["workspace_files", "gmail", "calendar", "contacts"] : ["calendar", "contacts"]}
            onDone={() => setOpen(false)}
          />
        </LazyGoogleAPIProvider>
      </ConnectorConsentShell>
    </div>
  );
}
