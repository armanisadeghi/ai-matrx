import {
  createDeterministicRecordingCanary,
  TRANSCRIPT_RECORDING_CANARY,
} from "./deterministicRecordingCanary";

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("Fixture Blob did not decode to an ArrayBuffer"));
      }
    };
    reader.readAsArrayBuffer(blob);
  });
}

describe("deterministic transcript recording canary", () => {
  it("emits the same audible PCM WAV without microphone input", async () => {
    const first = await readBlob(createDeterministicRecordingCanary());
    const second = await readBlob(createDeterministicRecordingCanary());
    const firstBytes = new Uint8Array(first);

    expect(firstBytes.slice(0, 4)).toEqual(
      new Uint8Array([0x52, 0x49, 0x46, 0x46]),
    );
    expect(new Uint8Array(first)).toEqual(new Uint8Array(second));
    expect(firstBytes.length).toBe(
      44 + 16_000 * TRANSCRIPT_RECORDING_CANARY.durationSeconds * 2,
    );
    expect(firstBytes.slice(44).some((value) => value !== 0)).toBe(true);
  });
});
