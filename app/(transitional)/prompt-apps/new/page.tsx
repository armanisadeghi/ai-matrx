import { createClient } from "@/utils/supabase/server";
import { CreatePromptAppFormWrapper } from "@/features/prompt-apps/components/CreatePromptAppFormWrapper";

interface NewPromptAppPageProps {
  searchParams: Promise<{ promptId?: string }>;
}

export default async function NewPromptAppPage({ searchParams }: NewPromptAppPageProps) {
  const supabase = await createClient();
  
  // Get user from server-side session
  const { data: { user } } = await supabase.auth.getUser();
  
  // Extract promptId from URL search params
  const params = await searchParams;
  const promptId = params.promptId;
  
  // Fetch user's prompts for selection - get all fields for auto-create
  const { data: prompts } = await supabase
    .from('prompts')
    .select('*')
    .eq('user_id', user!.id)
    .order('updated_at', { ascending: false });
  
  // Fetch categories
  const { data: categories } = await supabase
    .from('prompt_app_categories')
    .select('*')
    .order('sort_order');
  
  // Find the preselected prompt if promptId is provided
  const preselectedPrompt = promptId ? prompts?.find(p => p.id === promptId) : undefined;
  
  return (
    <div className="h-full flex flex-col overflow-hidden bg-textured">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <CreatePromptAppFormWrapper 
            prompts={prompts || []}
            categories={categories || []}
            preselectedPromptId={promptId}
            preselectedPrompt={preselectedPrompt}
          />
        </div>
      </div>
    </div>
  );
}
