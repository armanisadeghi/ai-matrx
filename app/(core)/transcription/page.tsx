import TranscriptionLanding from "@/features/transcript-studio/components/landing/TranscriptionLanding";

export default function TranscriptionPage() {
  return (
    <div className="h-dvh w-full overflow-y-auto bg-textured">
      <div style={{ height: "var(--shell-header-h, 2.75rem)" }} />
      <TranscriptionLanding />
    </div>
  );
}
