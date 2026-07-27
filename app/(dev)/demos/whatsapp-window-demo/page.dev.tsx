import { createClient } from "@/utils/supabase/server";
import { WhatsAppWindowDemoClient } from "./WhatsAppWindowDemoClient";

interface PageProps {
  searchParams: Promise<{ mock?: string }>;
}

export default async function WhatsAppWindowDemoPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const initialMode = params.mock === "1" ? "mock" : "live";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <WhatsAppWindowDemoClient
      initialMode={initialMode}
      userName={
        (user?.user_metadata?.full_name as string | undefined) ??
        (user?.email?.split("@")[0] as string | undefined) ??
        "You"
      }
      userAvatarUrl={
        (user?.user_metadata?.avatar_url as string | undefined) ?? null
      }
    />
  );
}
