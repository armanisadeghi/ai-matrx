import { createClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';
import { PromptAppEditor } from '@/features/prompt-apps/components/PromptAppEditor';

interface PromptAppPageProps {
  params: Promise<{
    id: string;
  }>;
}

// Helper to check if string is a valid UUID
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export default async function PromptAppPage({ params }: PromptAppPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Determine if we're searching by ID or slug
  const isId = isUUID(id);
  const column = isId ? 'id' : 'slug';

  // RLS ensures user can only fetch their own apps
  const { data: app, error } = await supabase
    .from('prompt_apps')
    .select('*')
    .eq(column, id)
    .single();

  if (error || !app) {
    notFound();
  }

  return <PromptAppEditor app={app} />;
}

