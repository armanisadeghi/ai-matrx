// The context menu's AI payload no longer carries each content block's
// template (the menu draws labels only). The text is fetched by id the first
// time a block is inserted, then cached on the block's store row so every
// later insert is instant.
import { supabase } from "@/utils/supabase/client";
import { sklActions } from "@/features/agent-connections/redux/skl/slice";

type Dispatch = (action: unknown) => unknown;

export async function ensureBlockTemplate(
  blockId: string,
  dispatch: Dispatch,
): Promise<string> {
  const { data, error } = await supabase
    .schema("skill")
    .from("render_definition")
    .select("template")
    .eq("id", blockId)
    .single();
  if (error) throw new Error(error.message);
  const template = (data as { template: string | null } | null)?.template ?? "";
  dispatch(sklActions.renderDefinitionsMerged([{ id: blockId, template }]));
  return template;
}
