// app/(dev)/demos/dashboard/page.tsx — Server-rendered dashboard
// 100% server component. No "use client" anywhere in this file.
// Layout wrapper (PageHeader + content div) lives in layout.tsx.

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import DashboardGrid from "./components/DashboardGrid";
import QuickActions from "./components/QuickActions";
import WelcomeCard from "./components/WelcomeCard";
import RecentActivity from "./components/RecentActivity";

export default async function DashboardPage() {
  const { user } = await getServerAuth();

  let dashboardUser: {
    name: string;
    email?: string;
    avatarUrl?: string;
  } | null = null;
  if (user) {
    const meta = user.user_metadata ?? {};
    dashboardUser = {
      name:
        meta.full_name ||
        meta.name ||
        meta.display_name ||
        user.email?.split("@")[0] ||
        "User",
      email: user.email,
      avatarUrl: meta.avatar_url || meta.picture || undefined,
    };
  }

  return (
    <>
      <section>
        <DashboardGrid />
      </section>
      <section>
        <QuickActions />
      </section>

      <section>
        <RecentActivity />
      </section>

      <WelcomeCard user={dashboardUser} />
    </>
  );
}
