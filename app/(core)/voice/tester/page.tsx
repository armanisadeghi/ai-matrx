import { TtsTesterBench } from "@/features/tts/tester/TtsTesterBench";
import { VoiceHubHeader } from "@/features/tts/components/VoiceHubHeader";

export default function VoiceTesterPage() {
  return (
    <>
      <VoiceHubHeader />
      <div className="h-full overflow-hidden">
        <TtsTesterBench />
      </div>
    </>
  );
}
