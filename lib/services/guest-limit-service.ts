/**
 * Guest Limit Service
 *
 * Handles checking and recording guest execution limits
 * Communicates with Supabase functions for global tracking
 */

import { supabase } from "@/utils/supabase/client";

export interface GuestLimitStatus {
  allowed: boolean;
  remaining: number;
  total_used: number;
  is_blocked: boolean;
  guest_id: string | null;
}

export interface GuestExecutionResult {
  success: boolean;
  log_id: string | null;
  error?: string;
}

/**
 * Check if guest can execute (global limit across all apps)
 *
 * @param supabaseOrFingerprint - Supabase client (server-side) or fingerprint string (client-side)
 * @param fingerprint - Visitor fingerprint (only if first param is supabase client)
 * @param maxExecutions - Maximum daily executions (default: 5)
 * @returns Status indicating if execution is allowed
 */
export async function checkGuestLimit(
  supabaseOrFingerprint: any | string,
  fingerprint?: string,
  maxExecutions: number = 5,
): Promise<GuestLimitStatus> {
  try {
    // Support both client-side and server-side usage
    const isServerSide =
      typeof supabaseOrFingerprint === "object" &&
      supabaseOrFingerprint !== null;
    const supabaseClient = isServerSide ? supabaseOrFingerprint : supabase;
    const fp = isServerSide ? fingerprint! : supabaseOrFingerprint;

    const { data, error } = await supabaseClient.rpc(
      "check_guest_execution_limit",
      {
        p_fingerprint: fp,
        p_max_executions: maxExecutions,
      },
    );

    if (error) {
      console.error("Error checking guest limit:", error);
      throw error;
    }

    if (!data || data.length === 0) {
      // No data = allow execution (will be created on first use)
      return {
        allowed: true,
        remaining: maxExecutions - 1,
        total_used: 0,
        is_blocked: false,
        guest_id: null,
      };
    }

    return data[0];
  } catch (error) {
    console.error("Failed to check guest limit:", error);

    // IMPORTANT: Fail closed for cost control
    // If we can't check limits, don't allow execution
    return {
      allowed: false,
      remaining: 0,
      total_used: 0,
      is_blocked: true,
      guest_id: null,
    };
  }
}

/**
 * Record a guest execution
 *
 * @param supabaseOrParams - Supabase client (server-side) or params object (client-side)
 * @param params - Execution details (only if first param is supabase client)
 * @returns Log ID if successful
 */
export async function recordGuestExecution(
  supabaseOrParams: any,
  params?: {
    fingerprint: string;
    resourceType: "prompt_app" | "chat" | "voice" | "other";
    resourceId?: string;
    resourceName?: string;
    taskId?: string;
    ipAddress?: string;
    userAgent?: string;
    referer?: string;
  },
): Promise<GuestExecutionResult> {
  try {
    // Support both client-side and server-side usage
    const isServerSide = params !== undefined;
    const supabaseClient = isServerSide ? supabaseOrParams : supabase;
    const execParams = isServerSide ? params! : supabaseOrParams;

    const { data, error } = await supabaseClient.rpc("record_guest_execution", {
      p_fingerprint: execParams.fingerprint,
      p_resource_type: execParams.resourceType,
      p_resource_id: execParams.resourceId || null,
      p_resource_name: execParams.resourceName || null,
      p_task_id: execParams.taskId || null,
      p_ip_address: execParams.ipAddress || null,
      p_user_agent: execParams.userAgent || null,
      p_referer: execParams.referer || null,
    });

    if (error) {
      console.error("Error recording guest execution:", error);
      return {
        success: false,
        log_id: null,
        error: error.message,
      };
    }

    return {
      success: true,
      log_id: data,
    };
  } catch (error: any) {
    console.error("Failed to record guest execution:", error);
    return {
      success: false,
      log_id: null,
      error: error?.message || "Unknown error",
    };
  }
}

/**
 * Get guest execution history (for debugging/admin)
 */
export async function getGuestHistory(fingerprint: string) {
  try {
    const supabaseClient = supabase;

    // First get guest record
    const { data: guest, error: guestError } = await supabaseClient
      .from("guest_executions")
      .select("*")
      .eq("fingerprint", fingerprint)
      .single();

    if (guestError || !guest) {
      return null;
    }

    // Get execution log
    const { data: logs, error: logsError } = await supabaseClient
      .from("guest_execution_log")
      .select("*")
      .eq("guest_id", guest.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (logsError) {
      console.error("Error fetching guest logs:", logsError);
      return { guest, logs: [] };
    }

    return { guest, logs: logs || [] };
  } catch (error) {
    console.error("Failed to get guest history:", error);
    return null;
  }
}

/**
 * Get current guest status with detailed info
 */
export async function getGuestStatus(fingerprint: string) {
  try {
    const supabaseClient = supabase;

    const { data, error } = await supabaseClient
      .from("guest_executions")
      .select("*")
      .eq("fingerprint", fingerprint)
      .single();

    if (error) {
      // No record yet = new guest
      if (error.code === "PGRST116") {
        return {
          isNew: true,
          totalExecutions: 0,
          dailyExecutions: 0,
          remaining: 5,
          isBlocked: false,
        };
      }
      throw error;
    }

    const dailyExecutions = data.daily_executions ?? 0;

    return {
      isNew: false,
      totalExecutions: data.total_executions,
      dailyExecutions,
      remaining: Math.max(0, 5 - dailyExecutions),
      isBlocked: data.is_blocked,
      blockedUntil: data.blocked_until,
      firstExecution: data.first_execution_at,
      lastExecution: data.last_execution_at,
    };
  } catch (error) {
    console.error("Failed to get guest status:", error);
    return null;
  }
}
