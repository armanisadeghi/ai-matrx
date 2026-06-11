import PicklistLanding from "@/features/udt-picklist/PicklistLanding";


export default function PicklistsLandingPage() {
  return (
    <div className="h-dvh w-full overflow-y-auto bg-textured">
      <div style={{ height: "var(--shell-header-h, 2.75rem)" }} />
      <PicklistLanding />
    </div>
  );
}
