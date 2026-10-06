import { DemosChatUiRegistrations } from "@/providers/DemosChatUiRegistrations";

/** The real drift-alert hook reads its chat-package registrations on mount. */
export default function AgentsAllSampleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DemosChatUiRegistrations />
      {children}
    </>
  );
}
