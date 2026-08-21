"use client";

import {
  CirclePause,
  CirclePlay,
  MessageSquareText,
  MessagesSquare,
  Send,
  ShieldCheck,
} from "lucide-react";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsReadOnlyValue } from "@/components/official/settings/layout/SettingsReadOnlyValue";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsRow } from "@/components/official/settings/SettingsRow";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
import { MandateAgentPicker } from "@/features/agents/mandates/components/MandateAgentPicker";
import { useMandate } from "@/features/agents/mandates/useMandate";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import {
  assistantBlockedReasonLabel,
  SMS_ASSISTANT_OWNER_BETA_MANDATE,
  smsPermissionLabel,
} from "@/features/sms/assistant-program";
import { useSmsAssistantProgram } from "@/features/sms/hooks/useSmsAssistantProgram";
import { useAppSelector } from "@/lib/redux/hooks";

/** Closed owner-beta control on the production Messaging settings surface. */
export function SmsAssistantSettingsSection() {
  const assistant = useSmsAssistantProgram();
  const mandate = useMandate(SMS_ASSISTANT_OWNER_BETA_MANDATE);
  const state = assistant.state;
  const resolvedAgentId = mandate.mandate?.agentId ?? null;
  const selectedAgent = useAppSelector((rootState) =>
    resolvedAgentId ? selectAgentById(rootState, resolvedAgentId) : undefined,
  );
  const transportBlockedReasons =
    state?.blockedReasons.filter((reason) => reason !== "agent_not_selected") ??
    [];
  const effectiveReady = Boolean(
    state && mandate.mandate && transportBlockedReasons.length === 0,
  );

  return (
    <>
      <SettingsSection
        title="Text assistant"
        description="Owner beta: bind one verified phone to one saved agent. The Holder keeps its complete tool set; consequential actions pause for recent sign-in confirmation."
        icon={MessagesSquare}
      >
        <SettingsReadOnlyValue
          label="Assistant status"
          description={
            !state
              ? assistant.loading
                ? "Checking your verified phone and assistant binding."
                : "No verified text-assistant enrollment was found for this account."
              : mandate.error
                ? `The SMS Mandate could not resolve: ${mandate.error}`
                : transportBlockedReasons.length
                  ? transportBlockedReasons
                      .map(assistantBlockedReasonLabel)
                      .join(" ")
                  : mandate.loading
                    ? "Resolving the SMS Mandate and your Binding."
                    : "The verified phone, sender, program, and Mandate Binding are ready."
          }
          value={
            state
              ? effectiveReady
                ? "Ready for owner testing"
                : !state.userAssistantEnabled
                  ? "Paused"
                  : "Needs attention"
              : assistant.loading
                ? "Loading…"
                : "Unavailable"
          }
          icon={state?.ready ? ShieldCheck : MessageSquareText}
        />
        <SettingsReadOnlyValue
          label="Verified phone"
          description="Incoming texts from this verified enrollment resolve to your account."
          value={state?.verifiedUserPhone ?? "Not verified"}
        />
        <SettingsReadOnlyValue
          label="Text permission"
          description="Notification enrollment and assistant replies are controlled separately."
          value={state ? smsPermissionLabel(state) : "Unavailable"}
        />
        <SettingsReadOnlyValue
          label="Sender and program"
          description={
            state?.numberActive && state.globalAssistantEnabled
              ? "The approved sender and global assistant program are active."
              : "The operator kill switch is off; assistant replies cannot be delivered."
          }
          value={
            state?.maskedPhone && state.programKey
              ? `${state.maskedPhone} · ${state.programKey}`
              : "Not configured"
          }
        />
        <SettingsRow
          label="SMS Mandate Binding"
          description="This is the single source of truth for which agent answers your texts. Changing it does not turn replies on or off."
          disabled={!state || assistant.loading || mandate.loading}
        >
          <div className="flex min-w-0 items-center justify-end gap-2">
            {resolvedAgentId && selectedAgent?.name ? (
              <EntityRef
                token="agent"
                id={resolvedAgentId}
                name={selectedAgent.name}
                openInNewTab
              />
            ) : null}
            <MandateAgentPicker mandateKey={SMS_ASSISTANT_OWNER_BETA_MANDATE} />
          </div>
        </SettingsRow>
        {/* THE DOOR LAW: deep-link filtered to this feature's domain — the
            bare /agents/mandates lands on 264 mandates across 45 domains,
            which is a scroll, not a door. */}
        <SettingsLink
          label="Mandate controls"
          description="Open the full Mandate editor to inspect provenance, version policy, and reset your Binding."
          href="/agents/mandates?feature=sms"
          actionLabel="Open Mandates"
        />
        {state?.chatConversationId ? (
          <SettingsLink
            label="Conversation history"
            description="Open the same canonical conversation used by SMS."
            href={`/chat/${state.chatConversationId}`}
            actionLabel="Open chat"
            external
          />
        ) : null}
        <SettingsButton
          label={
            state?.userAssistantEnabled
              ? "Pause assistant replies"
              : "Enable assistant replies"
          }
          description={
            state?.userAssistantEnabled
              ? "Pausing preserves the saved-agent binding and does not disable notifications."
              : "Enable only after the verified phone and saved agent are correct."
          }
          actionLabel={state?.userAssistantEnabled ? "Pause" : "Enable"}
          actionIcon={state?.userAssistantEnabled ? CirclePause : CirclePlay}
          loading={assistant.loading}
          disabled={
            !state ||
            !mandate.mandate ||
            (!state.userAssistantEnabled && !state.globalAssistantEnabled)
          }
          onClick={() => {
            if (!state) return;
            void assistant.update(
              { userAssistantEnabled: !state.userAssistantEnabled },
              state.userAssistantEnabled
                ? "Text assistant paused. Notifications remain enabled."
                : "Text assistant enabled for the verified binding.",
            );
          }}
        />
        <SettingsButton
          label="Safe delivery test"
          description="Queues a harmless system message through the durable production outbox."
          actionLabel="Send test"
          actionIcon={Send}
          kind="outline"
          loading={assistant.loading}
          disabled={!effectiveReady}
          onClick={assistant.sendTest}
          last
        />
      </SettingsSection>

      {assistant.result ? (
        <SettingsCallout tone={assistant.result.success ? "success" : "error"}>
          {assistant.result.message}
        </SettingsCallout>
      ) : null}
    </>
  );
}
