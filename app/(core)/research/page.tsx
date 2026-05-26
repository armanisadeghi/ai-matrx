import ResearchLanding from "@/features/research/components/landing/ResearchLanding";

export default function ResearchPage() {
  return (
    <div className="h-dvh w-full overflow-y-auto bg-textured">
      <div style={{ height: "var(--shell-header-h, 2.75rem)" }} />
      <ResearchLanding />
    </div>
  );
}
