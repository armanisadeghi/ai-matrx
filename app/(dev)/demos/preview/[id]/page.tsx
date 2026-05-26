import { createClient } from '@/utils/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { PromptAppPreview } from '@/features/prompt-apps/components/PromptAppPreview';

interface PreviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function PromptAppPreviewPage({ params }: PreviewPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  // Fetch app (by ID or slug)
  const { data: app, error } = await supabase
    .from('prompt_apps')
    .select('*')
    .or(`id.eq.${id},slug.eq.${id}`)
    .single();

  if (error || !app) {
    notFound();
  }

  // Check ownership
  if (app.user_id !== user.id) {
    return (
      <div className="h-page flex items-center justify-center bg-textured">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
          <p className="text-muted-foreground mt-2">You don't have permission to preview this app.</p>
        </div>
      </div>
    );
  }

  return <PromptAppPreview app={app} slug={app.slug} isDraft={app.status !== 'published'} />;
}

