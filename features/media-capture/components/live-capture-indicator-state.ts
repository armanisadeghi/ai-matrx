import type {
  LiveCaptureControls,
  LiveCaptureInfo,
} from "@/features/media-capture/runtime/mediaCaptureDiagnostics";

/**
 * The app-wide recording pill is a persistence controller, not a generic
 * recorder-status badge. Low-level consumers such as product capture own
 * their own stop/save UI and deliberately publish no global controls.
 */
export function resolveGlobalCaptureControls(
  live: LiveCaptureInfo | null,
  controls: LiveCaptureControls | null,
): LiveCaptureControls | null {
  return live && controls ? controls : null;
}
