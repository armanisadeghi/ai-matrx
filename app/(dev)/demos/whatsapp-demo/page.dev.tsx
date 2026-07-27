import { createClient } from "@/utils/supabase/server";
import { WhatsAppDemoClient } from "./WhatsAppDemoClient";

interface PageProps {
  searchParams: Promise<{ mock?: string }>;
}

export default async function WhatsAppDemoPage({ searchParams }: PageProps) {
  const params = await searchParams;
  // Default to LIVE data — demo wires to features/messaging + features/files.
  // Add ?mock=1 to view with curated demo data instead.
  const initialMode = params.mock === "1" ? "mock" : "live";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <WhatsAppDemoClient
      initialMode={initialMode}
      userName={
        (user?.user_metadata?.full_name as string | undefined) ??
        (user?.email?.split("@")[0] as string | undefined) ??
        "Armani"
      }
      userAvatarUrl={
        (user?.user_metadata?.avatar_url as string | undefined) ?? null
      }
    />
  );
}
