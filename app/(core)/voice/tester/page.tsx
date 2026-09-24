import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { TtsTesterBench } from "@/features/tts/tester/TtsTesterBench";
import { VoiceHubHeader } from "@/features/tts/components/VoiceHubHeader";

export default async function VoiceTesterPage() {
  // The tester bench mints brokered TTS tokens — anonymous visitors would
  // hit auth errors. Guests get the /voice marketing landing instead.
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/voice");
  return (
    <>
      <VoiceHubHeader />
      <div className="h-full overflow-hidden">
        <TtsTesterBench />
      </div>
    </>
  );
}
