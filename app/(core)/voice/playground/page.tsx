import AiVoicePage from "@/features/audio/voice/AiVoicePage";
import { VoiceHubHeader } from "@/features/tts/components/VoiceHubHeader";

export default function VoicePlaygroundPage() {
  return (
    <>
      <VoiceHubHeader />
      <div className="h-full overflow-hidden">
        <AiVoicePage />
      </div>
    </>
  );
}
