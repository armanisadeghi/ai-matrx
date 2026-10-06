import { DemosChatUiRegistrations } from "@/providers/DemosChatUiRegistrations";

/** The chat composer attach-menu variant depends on app-provided slots. */
export default function AttachMenuDemosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DemosChatUiRegistrations />
      {children}
    </>
  );
}
