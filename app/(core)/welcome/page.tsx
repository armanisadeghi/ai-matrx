import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { WelcomeClient } from "./WelcomeClient";

export const metadata: Metadata = {
  title: "Welcome",
  description: "Get started with AI Matrx",
};

export default async function WelcomePage() {
  const { user } = await getServerAuth();
  if (!user) {
    redirect("/login?redirectTo=/welcome");
  }

  const firstName =
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.split(" ")[0]
      : null) ||
    (typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name.split(" ")[0]
      : null) ||
    null;

  return <WelcomeClient firstName={firstName} />;
}
