"use client";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { InputCapabilitiesEditor } from "@/features/agents/components/settings-management/ui-gates/InputCapabilitiesEditor";
import { selectInputCapabilitiesState } from "@/features/agents/redux/execution-system/instance-input-capabilities/instance-input-capabilities.selectors";
import {
  resetInputCapabilityOverride,
  setInputCapabilityOverride,
} from "@/features/agents/redux/execution-system/instance-input-capabilities/instance-input-capabilities.slice";
import { persistInputCapabilities } from "@/features/agents/redux/execution-system/instance-input-capabilities/instance-input-capabilities.persistence";
import {
  UI_GATE_EDITABLE_KEYS,
  type UiGateEditableKey,
} from "@/lib/redux/slices/agent-settings/ui-gates";

interface RunInputCapabilitiesProps {
  conversationId: string;
}

/** Conversation-scoped frontend capability overrides. */
export function RunInputCapabilities({
  conversationId,
}: RunInputCapabilitiesProps) {
  const dispatch = useAppDispatch();
  const entry = useAppSelector(selectInputCapabilitiesState(conversationId));
  const effective = { ...(entry?.base ?? {}), ...(entry?.overrides ?? {}) };
  const overriddenKeys = new Set(
    UI_GATE_EDITABLE_KEYS.filter(
      (key) => entry?.overrides[key] !== undefined,
    ),
  );

  const changeCapability = (key: UiGateEditableKey, value: boolean) => {
    if (value === (entry?.base[key] === true)) {
      dispatch(resetInputCapabilityOverride({ conversationId, key }));
    } else {
      dispatch(setInputCapabilityOverride({ conversationId, key, value }));
    }
    void dispatch(persistInputCapabilities({ conversationId }));
  };

  const resetCapability = (key: UiGateEditableKey) => {
    dispatch(resetInputCapabilityOverride({ conversationId, key }));
    void dispatch(persistInputCapabilities({ conversationId }));
  };

  return (
    <>
    <InputCapabilitiesEditor
      values={effective}
      onChange={changeCapability}
      overriddenKeys={overriddenKeys}
      onReset={resetCapability}
      idPrefix={`run-ui-gate-${conversationId}`}
      title="Input Capabilities"
    />
    {entry?.persistence === "error" ? (
      <p className="mt-1 text-[10px] text-destructive" role="alert">
        Capability changes could not be saved. Try again.
      </p>
    ) : null}
    </>
  );
}
