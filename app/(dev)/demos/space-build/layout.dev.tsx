import { DemosChatUiRegistrations } from "@/providers/DemosChatUiRegistrations";

/** The live run window and its cards resolve app-provided chat UI slots. */
export default function SpaceBuildDemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DemosChatUiRegistrations />
      {children}
    </>
  );
}
