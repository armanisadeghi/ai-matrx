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

/** The person's program state, or null when they have no verified enrollment
 *  (a real answer, not a failure). A failed read throws. */
async function readProgram(): Promise<SmsAssistantProgramState | null> {
  const { data, error } = await supabase
    .schema("communication")
    .rpc("get_my_sms_assistant_program", {
      p_program_key: SMS_ASSISTANT_OWNER_BETA_PROGRAM,
    });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return smsAssistantProgramFromRpc(row);
}

function readFailureMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to load the text assistant binding.";
}

export function useSmsAssistantProgram() {
  const [state, setState] = useState<SmsAssistantProgramState | null>(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<AssistantProgramResult | null>(null);
  /** The program READ failed (distinct from a failed update/test `result`). */
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const program = await readProgram();
        if (!active) return;
        setState(program);
        setReadError(null);
      } catch (error) {
        if (!active) return;
        setReadError(readFailureMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  /** Read the program again after a failed read. */
  const retry = async () => {
    setLoading(true);
    setReadError(null);
    try {
      setState(await readProgram());
    } catch (error) {
      setReadError(readFailureMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const update = async (
    input: UpdateSmsAssistantProgram,
    successMessage: string,
  ) => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase
        .schema("communication")
        .rpc("set_my_sms_assistant_enabled", {
          p_program_key: SMS_ASSISTANT_OWNER_BETA_PROGRAM,
          p_enabled: input.userAssistantEnabled,
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

  return { state, loading, result, readError, retry, update, sendTest };
}
