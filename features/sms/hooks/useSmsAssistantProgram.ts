"use client";

import { useEffect, useState } from "react";

import {
  SMS_ASSISTANT_TEST_BODY,
  SMS_ASSISTANT_OWNER_BETA_PROGRAM,
  smsAssistantProgramFromRpc,
  type SmsAssistantProgramState,
  type UpdateSmsAssistantProgram,
} from "@/features/sms/assistant-program";
import { supabase } from "@/utils/supabase/client";

interface AssistantProgramResult {
  success: boolean;
  message: string;
}

async function readProgram(): Promise<SmsAssistantProgramState> {
  const { data, error } = await supabase
    .schema("communication")
    .rpc("get_my_sms_assistant_program", {
      p_program_key: SMS_ASSISTANT_OWNER_BETA_PROGRAM,
    });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("No verified text-assistant enrollment was found.");
  return smsAssistantProgramFromRpc(row);
}

export function useSmsAssistantProgram() {
  const [state, setState] = useState<SmsAssistantProgramState | null>(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<AssistantProgramResult | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const program = await readProgram();
        if (active) setState(program);
      } catch (error) {
        if (!active) return;
        setResult({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Unable to load the text assistant binding.",
        });
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const update = async (
    input: UpdateSmsAssistantProgram,
    successMessage: string,
  ) => {
    const agentId =
      input.preferredAgentId === undefined
        ? state?.preferredAgentId
        : input.preferredAgentId;
    const agentVersionId =
      input.preferredAgentVersionId === undefined
        ? state?.preferredAgentVersionId
        : input.preferredAgentVersionId;
    if (!agentId) {
      setResult({
        success: false,
        message: "Choose a saved agent before changing assistant replies.",
      });
      return null;
    }

    setLoading(true);
    setResult(null);
    try {
      const communication = supabase.schema("communication");
      const { data, error } = agentVersionId
        ? await communication.rpc("configure_my_sms_assistant_version", {
            p_program_key: SMS_ASSISTANT_OWNER_BETA_PROGRAM,
            p_enabled: input.userAssistantEnabled,
            p_agent_id: agentId,
            p_agent_version_id: agentVersionId,
          })
        : await communication.rpc("configure_my_sms_assistant", {
            p_program_key: SMS_ASSISTANT_OWNER_BETA_PROGRAM,
            p_enabled: input.userAssistantEnabled,
            p_agent_id: agentId,
          });
      if (error) throw error;
      const row = data?.[0];
      if (!row)
        throw new Error("The text assistant did not return its updated state.");
      const program = smsAssistantProgramFromRpc(row);
      setState(program);
      setResult({ success: true, message: successMessage });
      return program;
    } catch (error) {
      setResult({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to update the text assistant binding.",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase
        .schema("communication")
        .rpc("disconnect_my_sms_assistant", {
          p_program_key: SMS_ASSISTANT_OWNER_BETA_PROGRAM,
        });
      if (error) throw error;
      const row = data?.[0];
      if (!row)
        throw new Error(
          "The text assistant did not return its disconnected state.",
        );
      const program = smsAssistantProgramFromRpc(row);
      setState(program);
      setResult({
        success: true,
        message:
          "Text assistant disconnected. SMS notifications remain enrolled.",
      });
      return program;
    } catch (error) {
      setResult({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to disconnect the text assistant.",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const sendTest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase
        .schema("communication")
        .rpc("enqueue_my_sms_assistant_test", {
          p_program_key: SMS_ASSISTANT_OWNER_BETA_PROGRAM,
          p_body: SMS_ASSISTANT_TEST_BODY,
          p_idempotency_key: `sms-assistant-test:${crypto.randomUUID()}`,
        });
      if (error) throw error;
      if (!data) throw new Error("The safe test was not queued.");
      setResult({
        success: true,
        message: "Safe test queued. It should arrive within a few seconds.",
      });
    } catch (error) {
      setResult({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to queue the test text.",
      });
    } finally {
      setLoading(false);
    }
  };

  return { state, loading, result, update, disconnect, sendTest };
}
