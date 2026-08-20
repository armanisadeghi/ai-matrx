import { createRouteMetadata } from "@/utils/route-metadata";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { MessagesSquare } from "lucide-react";

export const metadata = createRouteMetadata("/vision-interview", {
  title: "Vision Interview",
  description:
    "Turn an idea into a clear, build-ready vision through a guided interview.",
  canonicalPath: "/vision-interview",
});

export default async function VisionInterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Vision Interview"
        route="/vision-interview"
        description="Turn an idea into a clear, build-ready vision through a guided interview."
        icon={MessagesSquare}
      />
    );
  }
  return children;
}
