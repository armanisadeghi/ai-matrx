"use client";

import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { InputCapabilitiesEditor } from "@ai-matrx/chat/host/ui-slots";
import { selectInputCapabilitiesState } from "../../redux/execution-system/instance-input-capabilities/instance-input-capabilities.selectors";
import {
  resetInputCapabilityOverride,
  setInputCapabilityOverride,
} from "../../redux/execution-system/instance-input-capabilities/instance-input-capabilities.slice";
import { persistInputCapabilities } from "../../redux/execution-system/instance-input-capabilities/instance-input-capabilities.persistence";
import {
  UI_GATE_EDITABLE_KEYS,
  type UiGateEditableKey,
} from "../../redux/agent-settings/ui-gates";
import { ErrorAlchemyMenu } from "@ai-matrx/chat/host/ui-slots";

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
      title="Input capabilities"
      variant="menu"
    />
    {entry?.persistence === "error" ? (
      <p className="px-3 pb-2 text-xs text-destructive" role="alert">
        Capability changes could not be saved. Try again.
        <ErrorAlchemyMenu className="ml-auto" />
      </p>
    ) : null}
    </>
  );
}
