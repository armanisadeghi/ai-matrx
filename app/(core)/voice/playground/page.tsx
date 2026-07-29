import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import AiVoicePage from "@/features/audio/voice/AiVoicePage";
import { VoiceHubHeader } from "@/features/tts/components/VoiceHubHeader";

export default async function VoicePlaygroundPage() {
  // The playground workspace is user-scoped (voice catalog init + brokered
  // TTS tokens error for anonymous visitors). Guests get the /voice
  // marketing landing instead — never an error panel.
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/voice");
  return (
    <>
      <VoiceHubHeader />
      <div className="h-full overflow-hidden">
        <AiVoicePage />
      </div>
    </>
  );
}
