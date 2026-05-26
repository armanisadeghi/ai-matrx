import CaWcLanding from "@/features/legal/wc/components/landing/CaWcLanding";

export default function CaWcPage() {
  return (
    <div className="h-dvh w-full overflow-y-auto bg-textured">
      <div style={{ height: "var(--shell-header-h, 2.75rem)" }} />
      <CaWcLanding />
    </div>
  );
}
