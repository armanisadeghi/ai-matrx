import LegalLanding from "@/features/legal/components/landing/LegalLanding";

export default function LegalPage() {
  return (
    <div className="h-dvh w-full overflow-y-auto bg-textured">
      <div style={{ height: "var(--shell-header-h, 2.75rem)" }} />
      <LegalLanding />
    </div>
  );
}
