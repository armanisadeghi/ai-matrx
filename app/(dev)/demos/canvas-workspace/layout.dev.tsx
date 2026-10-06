import { DemosChatUiRegistrations } from "@/providers/DemosChatUiRegistrations";

/** Workspace chrome loads chat popovers, floating frames, and app navigation slots. */
export default function CanvasWorkspaceDemosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DemosChatUiRegistrations />
      {children}
    </>
  );
}
