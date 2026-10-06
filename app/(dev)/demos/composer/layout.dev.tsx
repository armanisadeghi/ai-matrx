import { DemosChatUiRegistrations } from "@/providers/DemosChatUiRegistrations";

/** SmartAgentInput reads model slots during initial client render. */
export default function ComposerDemosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DemosChatUiRegistrations />
      {children}
    </>
  );
}
