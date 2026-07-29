import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { TtsTesterBench } from "@/features/tts/tester/TtsTesterBench";
import { VoiceHubHeader } from "@/features/tts/components/VoiceHubHeader";

export default async function VoiceTesterPage() {
  // The tester bench mints brokered TTS tokens — anonymous visitors would
  // hit auth errors. Guests get the /voice marketing landing instead.
  const { isAuthenticated } = await getServerAuth();
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
