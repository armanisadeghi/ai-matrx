import { createClient } from "@/utils/supabase/server";
import { PromptAppsListClient } from "./PromptAppsListClient";

export default async function PromptAppsListPage() {
  const supabase = await createClient();
  
  // RLS ensures user only sees their own apps
  const { data: apps } = await supabase
    .from('prompt_apps')
    .select('*')
    .order('updated_at', { ascending: false });

  return <PromptAppsListClient apps={apps || []} />;
}
