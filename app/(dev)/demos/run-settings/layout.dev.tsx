import { DemosChatUiRegistrations } from "@/providers/DemosChatUiRegistrations";

/** Run-settings controls use the chat package's app-owned UI integrations. */
export default function RunSettingsDemosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DemosChatUiRegistrations />
      {children}
    </>
  );
}
