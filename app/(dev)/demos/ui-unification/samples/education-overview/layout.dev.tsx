import { DemosChatUiRegistrations } from "@/providers/DemosChatUiRegistrations";

/** ScrollAssistantLauncher calls useOrganizationRequired through the chat host. */
export default function EducationOverviewSampleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DemosChatUiRegistrations />
      {children}
    </>
  );
}
