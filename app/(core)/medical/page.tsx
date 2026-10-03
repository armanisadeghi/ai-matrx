// app/(core)/medical/page.tsx — the Medical front door (module-landing-pages).
//
// One route, two audiences, decided server-side:
//   • guest  → the marketing landing (never a login wall, never an error).
//   • member → the workspace. It is not built yet, so members get the
//     registered `medical.workspace` promise plus doors to what already works
//     today (ModulePromiseSurface — a named placeholder shell, so the route
//     manifest tells the server this route is a placeholder).

import { BookOpen, ClipboardList, MessageCircle, Mic, Stethoscope, Webhook } from "lucide-react";

import MedicalLanding from "@/features/auth/components/module-landing/landings/MedicalLanding";
import { ModulePromiseSurface } from "@/features/auth/components/module-landing/ModulePromiseSurface";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

export default async function MedicalPage() {
  const { isAuthenticated } = await getSessionVerdict();

  if (!isAuthenticated) {
    return (
      <MarketingPageShell>
        <MedicalLanding />
      </MarketingPageShell>
    );
  }

  return (
    <ModulePromiseSurface
      title="Medical"
      icon={Stethoscope}
      promiseKey="medical.workspace"
      doorsHeading="Ready to use today"
      doors={[
        { href: "/agents", label: "Agents", hint: "Turn a protocol into an agent", icon: Webhook },
        { href: "/chat", label: "Chat", hint: "Ask, draft and summarize", icon: MessageCircle },
        { href: "/knowledge", label: "Knowledge", hint: "Search your guidelines", icon: BookOpen },
        { href: "/transcripts", label: "Transcripts", hint: "Turn a recording into notes", icon: Mic },
        { href: "/make", label: "Forms and booking", hint: "Intake forms and booking pages", icon: ClipboardList },
      ]}
    />
  );
}
