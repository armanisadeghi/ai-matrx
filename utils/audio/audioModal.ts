// utils/audio/audioModal.ts
//
// Imperative entry to the global audio (TTS) modal. The host lives inside the
// lazily-mounted audio system (providers/AudioSystemHostImpl.tsx), so the
// first `showAudioModal()` on a cold tab activates the audio system, queues
// the request, and the host flushes it when it registers moments later.
import { activateAudio } from "@/features/audio/activation";
import type { AudioModalOptions } from "@/types/audio";

let showAudioModalFn: ((props: AudioModalOptions) => void) | null = null;
// Latest request issued before the host mounted. Latest-wins — the modal shows
// one thing at a time, so an older queued request is intentionally dropped.
let pendingProps: AudioModalOptions | null = null;

export const registerAudioModal = (fn: (props: AudioModalOptions) => void) => {
  showAudioModalFn = fn;
  if (pendingProps) {
    const props = pendingProps;
    pendingProps = null;
    fn(props);
  }
};

export const unregisterAudioModal = () => {
  showAudioModalFn = null;
};

export const showAudioModal = (props: AudioModalOptions) => {
  activateAudio();
  if (showAudioModalFn) {
    showAudioModalFn(props);
    return;
  }
  pendingProps = props;
};
