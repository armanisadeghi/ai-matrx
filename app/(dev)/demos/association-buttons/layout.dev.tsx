import { DemosChatUiRegistrations } from "@/providers/DemosChatUiRegistrations";

/** ComposerPlusMenu reads host slots when the association variants mount. */
export default function AssociationButtonsDemosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DemosChatUiRegistrations />
      {children}
    </>
  );
}
