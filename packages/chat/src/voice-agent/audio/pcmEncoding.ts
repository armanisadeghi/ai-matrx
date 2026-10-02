// features/voice-agent/audio/pcmEncoding.ts
//
// PCM ↔ base64 conversion for xAI Realtime audio messages.
//
// The naïve approach — `btoa(String.fromCharCode(...new Uint8Array(buf)))` —
// uses the spread operator across the buffer's bytes. For audio buffers (often
// tens of KB) this CRASHES the JS engine with `RangeError: Maximum call stack
// size exceeded` because of how the V8 spread + apply allocate stack frames
// per argument. The fix is chunked encoding: walk the buffer in 8 KiB slices,
// concat the per-slice strings, then base64 once at the end.

const ENCODE_CHUNK_BYTES = 0x2000; // 8 KiB

/**
 * Encode an Int16 PCM buffer (xAI format: little-endian, mono) into base64.
 * Accepts the underlying ArrayBuffer (worklet posts these directly).
 */
export function int16BufferToBase64(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += ENCODE_CHUNK_BYTES) {
    const slice = bytes.subarray(i, i + ENCODE_CHUNK_BYTES);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

/**
 * Decode a base64 string into a Float32Array suitable for `AudioBuffer.getChannelData()`.
 * xAI sends Int16 PCM little-endian; we normalize to Float32 in [-1, 1].
 */
export function base64ToFloat32(b64: string): Float32Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);

  // View as Int16, normalize to Float32.
  const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, len >> 1);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 0x8000;
  }
  return float32;
}
