import { DemosChatUiRegistrations } from "@/providers/DemosChatUiRegistrations";

/** Agent ask and approval cards resolve app-provided chat UI slots. */
export default function AgentCardsDemosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DemosChatUiRegistrations />
      {children}
    </>
  );
}
