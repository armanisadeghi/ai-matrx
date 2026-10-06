import { DemosChatUiRegistrations } from "@/providers/DemosChatUiRegistrations";

/** The real AgentHeader and builder surface require the full chat UI profile. */
export default function AgentBuilderSampleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DemosChatUiRegistrations />
      {children}
    </>
  );
}
