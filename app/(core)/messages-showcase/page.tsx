import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import MessagesShowcase from "@/features/messaging/demo/MessagesShowcase";

export const metadata = { title: "Messages showcase" };

export default async function MessagesShowcasePage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/login?redirectTo=%2Fmessages-showcase");
  return <MessagesShowcase />;
}
