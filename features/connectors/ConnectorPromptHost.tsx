"use client";

// features/connectors/ConnectorPromptHost.tsx
//
// The mounted form of the prompt card: it resolves the provider's live state and
// opens the consent dialog. Kept separate from `ConnectorPromptCard` so the card
// itself stays a pure, provider-agnostic component that any surface can render
// with data it already has.
//
// It deliberately does NOT load the provider's authorization script — the card
// only opens a dialog, and the dialog brings its own provider. A card that pulled
// Google's GIS bundle into the new-chat screen would cost every visit a script
// nobody asked for.

import { ConnectorPromptCard } from "./ConnectorPromptCard";
import { accountHealth, anyProductConnected } from "./health";
import { useGoogleConnectorState } from "./google-adapter";
import { GOOGLE_CONNECTOR_PROVIDER } from "./provider-config";
import { useOpenConnectorConsentDialog } from "@/features/overlays/openers/connectorConsentDialog";

export function ConnectorPromptHost({
  className,
  variant = "card",
}: {
  className?: string;
  variant?: "card" | "bare";
}) {
  const provider = GOOGLE_CONNECTOR_PROVIDER;
  const state = useGoogleConnectorState();
  const openConsent = useOpenConnectorConsentDialog();

  const connected = state.accounts.some((account) =>
    anyProductConnected(
      accountHealth({ provider, account, rollout: state.rollout }),
    ),
  );

  return (
    <ConnectorPromptCard
      provider={provider}
      connected={connected}
      // A read that FAILED is not "not connected": while the answer is unknown
      // the card stays away rather than offering to connect something that may
      // already be connected.
      loading={state.isLoading || state.isError}
      onConnect={() => openConsent()}
      variant={variant}
      className={className}
    />
  );
}
