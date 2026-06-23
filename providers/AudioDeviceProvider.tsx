"use client";

// providers/AudioDeviceProvider.tsx
//
// App-root thin shell for the audio-device manager. Same pattern as
// AudioModalHost / AudioOutputHost: a thin client wrapper whose heavy/effectful
// body is `next/dynamic({ ssr: false })`, so nothing audio-device-related runs
// on the server and the listeners attach only in the browser.
//
// Mounted ABOVE GlobalRecordingProvider in app/Providers.tsx. Its only job is
// side effects (no children) — it wires `devicechange` / `permissionchange`
// listeners once, installs the AudioContext output-sink routing, and applies
// the user's persisted mic + speaker choice to the mic singleton / output sink
// EARLY (before the first recording) so the very first acquire uses the right
// device.

import dynamic from "next/dynamic";

const AudioDeviceProviderImpl = dynamic(
  () => import("./AudioDeviceProviderImpl"),
  { ssr: false },
);

export function AudioDeviceProvider() {
  return <AudioDeviceProviderImpl />;
}
