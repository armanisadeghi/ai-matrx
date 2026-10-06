import { DemosChatUiRegistrations } from "@/providers/DemosChatUiRegistrations";

/** Agent status indicators render through registered chat presentation slots. */
export default function ModelActivityIndicatorsDemosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DemosChatUiRegistrations />
      {children}
    </>
  );
}
