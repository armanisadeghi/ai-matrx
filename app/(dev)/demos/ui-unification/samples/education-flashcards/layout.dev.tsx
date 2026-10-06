import { DemosChatUiRegistrations } from "@/providers/DemosChatUiRegistrations";

/** The flashcard sample registers a live chat surface at mount. */
export default function EducationFlashcardsSampleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DemosChatUiRegistrations />
      {children}
    </>
  );
}
