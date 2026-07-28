"use client";

import { supabase } from "@/utils/supabase/client";

/** Toggle the one DB capability flag that controls generic Matrx write actions. */
export async function setEntityTypeAgentWritable(
  token: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase.rpc(
    "admin_set_entity_type_agent_writable",
    {
      p_token: token,
      p_agent_writable: enabled,
    },
  );
  if (error) throw error;
}
