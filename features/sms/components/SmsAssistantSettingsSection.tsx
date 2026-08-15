"use client";

import { useEffect, useState } from "react";
import {
  CirclePause,
  CirclePlay,
  Link2Off,
  MessageSquareText,
  MessagesSquare,
  Send,
  ShieldCheck,
} from "lucide-react";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsReadOnlyValue } from "@/components/official/settings/layout/SettingsReadOnlyValue";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsRow } from "@/components/official/settings/SettingsRow";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import {
  fetchAgentVersionHistory,
  type AgentVersionHistoryItem,
} from "@/features/agents/redux/agent-definition/thunks";
import {
  assistantBindingLabel,
  assistantBlockedReasonLabel,
  smsPermissionLabel,
} from "@/features/sms/assistant-program";
import { useSmsAssistantProgram } from "@/features/sms/hooks/useSmsAssistantProgram";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

const LATEST_VERSION = "latest";

/** Closed owner-beta control on the production Messaging settings surface. */
export function SmsAssistantSettingsSection() {
  const dispatch = useAppDispatch();
  const assistant = useSmsAssistantProgram();
  const state = assistant.state;
  const selectedAgent = useAppSelector((rootState) =>
    state?.preferredAgentId
      ? selectAgentById(rootState, state.preferredAgentId)
      : undefined,
  );
  const [versions, setVersions] = useState<AgentVersionHistoryItem[]>([]);
  const [versionAgentId, setVersionAgentId] = useState<string | null>(null);
  const versionsLoading = Boolean(
    state?.preferredAgentId && state.preferredAgentId !== versionAgentId,
  );

  useEffect(() => {
    const agentId = state?.preferredAgentId;
    if (!agentId) return;
    let active = true;
    dispatch(fetchAgentVersionHistory({ agentId, limit: 50, offset: 0 }))
      .unwrap()
      .then((items) => {
        if (active) {
          setVersions(
            [...items].sort((a, b) => b.version_number - a.version_number),
          );
          setVersionAgentId(agentId);
        }
      })
      .catch(() => {
        if (active) {
          setVersions([]);
          setVersionAgentId(agentId);
        }
      });
    return () => {
      active = false;
    };
  }, [dispatch, state?.preferredAgentId]);

  const versionOptions = [
    {
      value: LATEST_VERSION,
      label: "Always use latest",
      description: "Automatically uses the current saved version.",
    },
    ...versions.map((version) => ({
      value: version.version_id,
      label: `Version ${version.version_number}`,
      description: version.change_note || "Saved agent version",
    })),
  ];

  const selectAgent = (agentId: string) => {
    if (!state) return;
    void assistant.update(
      {
        userAssistantEnabled: state.userAssistantEnabled,
        preferredAgentId: agentId,
        preferredAgentVersionId: null,
      },
      "Saved agent selected. The text assistant remains in its current on/off state.",
    );
  };

  const selectVersion = (value: string) => {
    if (!state) return;
    void assistant.update(
      {
        userAssistantEnabled: state.userAssistantEnabled,
        preferredAgentId: state.preferredAgentId,
        preferredAgentVersionId: value === LATEST_VERSION ? null : value,
      },
      value === LATEST_VERSION
        ? "The text assistant will use the latest saved agent version."
        : "Saved agent version pinned.",
    );
  };

  const disconnect = async () => {
    if (
      !(await confirm({
        title: "Disconnect the text assistant?",
        description:
          "This pauses assistant replies and clears the saved-agent binding. SMS notifications remain enrolled.",
        confirmLabel: "Disconnect",
        variant: "destructive",
      }))
    ) {
      return;
    }
    await assistant.disconnect();
  };

  return (
    <>
      <SettingsSection
        title="Text assistant"
        description="Owner beta: bind one verified phone to one saved agent for harmless two-way chat. Agent tools remain disabled."
        icon={MessagesSquare}
      >
        <SettingsReadOnlyValue
          label="Assistant status"
          description={
            !state
              ? assistant.loading
                ? "Checking your verified phone and assistant binding."
                : "No verified text-assistant enrollment was found for this account."
              : state.blockedReasons.length
                ? state.blockedReasons
                    .map(assistantBlockedReasonLabel)
                    .join(" ")
                : "The verified binding, sender, program, and saved agent are ready."
          }
          value={
            state
              ? assistantBindingLabel(state)
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
          label="Saved agent"
          description="Selecting an agent does not turn the assistant on."
          disabled={!state || assistant.loading}
        >
          <div className="flex min-w-0 items-center justify-end gap-2">
            {state?.preferredAgentId && selectedAgent?.name ? (
              <EntityRef
                token="agent"
                id={state.preferredAgentId}
                name={selectedAgent.name}
                openInNewTab
              />
            ) : null}
            <AgentListDropdown
              consumerId="sms-assistant-agent-picker"
              activeAgentId={state?.preferredAgentId ?? null}
              label={state?.preferredAgentId ? "Change" : "Choose saved agent"}
              onSelect={selectAgent}
              resolveAgentHref={(agent) => `/agents/${agent.id}`}
              visibleTabs={["mine", "shared", "all", "system"]}
              compact
            />
          </div>
        </SettingsRow>
        {state?.preferredAgentId ? (
          <SettingsSelect
            label="Saved version"
            description="Use the latest version automatically or pin a specific saved version."
            value={state.preferredAgentVersionId ?? LATEST_VERSION}
            onValueChange={selectVersion}
            options={versionOptions}
            disabled={assistant.loading || versionsLoading}
            width="lg"
          />
        ) : null}
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
            (!state.userAssistantEnabled && !state.preferredAgentId) ||
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
          disabled={!state?.ready}
          onClick={assistant.sendTest}
        />
        <SettingsButton
          label="Disconnect text assistant"
          description="Clears the agent binding without changing SMS notification consent."
          actionLabel="Disconnect"
          actionIcon={Link2Off}
          kind="destructive"
          loading={assistant.loading}
          disabled={!state?.preferredAgentId && !state?.userAssistantEnabled}
          onClick={() => void disconnect()}
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
