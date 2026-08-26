import { renderToStaticMarkup } from "react-dom/server";
import { composeVoiceDraft, MessageInput } from "./MessageInput";

jest.mock("@/features/audio/components/MicrophoneIconButton", () => ({
  MicrophoneIconButton: ({ label }: { label: string }) => (
    <button aria-label={label} />
  ),
}));

jest.mock("@/features/matrx-envelope/components/AttachReferenceButton", () => ({
  AttachReferenceButton: () => <button aria-label="Attach a reference" />,
}));

jest.mock("@/features/matrx-envelope/components/ReferencePickerChip", () => ({
  ReferencePickerChip: () => null,
}));

jest.mock("@/components/icons/tap-buttons", () => ({
  SendTapButton: ({ ariaLabel }: { ariaLabel: string }) => (
    <button aria-label={ariaLabel} />
  ),
}));

describe("MessageInput voice input", () => {
  it("renders the microphone beside the direct-message composer", () => {
    const markup = renderToStaticMarkup(
      <MessageInput onSendMessage={jest.fn()} />,
    );

    expect(markup).toContain('aria-label="Record audio message"');
    expect(markup).toContain('aria-label="Attach a reference"');
    expect(markup.indexOf("Attach a reference")).toBeLessThan(
      markup.indexOf("Record audio message"),
    );
  });

  it("appends voice transcripts without duplicating the existing draft", () => {
    expect(composeVoiceDraft("Existing context", "spoken final")).toBe(
      "Existing context\nspoken final",
    );
    expect(composeVoiceDraft("", "spoken final")).toBe("spoken final");
  });
});
