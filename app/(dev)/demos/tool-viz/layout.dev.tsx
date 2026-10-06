import { DemosChatUiRegistrations } from "@/providers/DemosChatUiRegistrations";

/** Tool visualization renderers use the registered structured-value slots. */
export default function ToolVizDemosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DemosChatUiRegistrations />
      {children}
    </>
  );
}
