// app/(core)/camera/admin/page.tsx
//
// Per-feature admin map for the Media Capture feature (/camera). Renders via
// the platform primitive `<FeatureAdminPage>` (admin-gated — any level;
// non-admins are redirected before anything below renders), plus a read-only
// client diagnostics section fed by the `mediaCaptureDiagnostics` registry.
// Opening this page NEVER acquires a camera or prompts for permission.
//
// When you add a new capture-related route / window panel / overlay /
// component, update this map — the drift warnings on the rendered page
// surface anything missed.

export const dynamic = "force-dynamic";

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";
import { CameraAdminDiagnostics } from "@/features/media-capture/components/CameraAdminDiagnostics";

const CAMERA_ADMIN_MAP: FeatureAdminMap = {
  name: "Media Capture",
  slug: "camera",
  description:
    "One platform capture system for photos, video, and audio from browser media devices: the camera stream manager (the ONE getUserMedia({video}) site), the canonical MediaRecorder controller + crash-safety chunk journal, the capture uploader (Captures/* via fileHandler), the Capture Studio + /camera management lens, and the Media control window's Camera tab. Devices layer shared with Audio (features/media-devices).",
  docs: [
    {
      label: "Media Capture FEATURE.md",
      href: "/features/media-capture/FEATURE.md",
    },
    { label: "Execution plan", href: "/docs/media-capture-plan.md" },
    { label: "Audio FEATURE.md", href: "/features/audio/FEATURE.md" },
    {
      label: "File handler FEATURE.md (transport policy)",
      href: "/features/files/handler/FEATURE.md",
    },
  ],
  routeScanPath: "app/(core)/camera",

  routes: [
    {
      url: "/camera",
      label: "Capture Studio + library",
      description:
        "Photo/video/audio Capture Studio plus the full management lens over Captures/* (kind filters, upload chips + failed-upload retry, TUS resume indicator, journal recovery, canonical file actions).",
      filePath: "app/(core)/camera/page.tsx",
      status: "Live",
      notes: [
        "Lens rides the existing files data layer — no second query stack",
        "Recovery runs the SHARED finishJournalRecovery flow",
      ],
    },
    {
      url: "/camera/admin",
      label: "Admin map (this page)",
      description:
        "Admin index of every media-capture resource + read-only client diagnostics.",
      filePath: "app/(core)/camera/admin/page.tsx",
      status: "Live",
    },
  ],

  windowPanels: [
    {
      overlayId: "audioControlWindow",
      description:
        'The "Media" control window — Playback / Recording / Camera / Devices tabs. The Camera tab is this feature\'s live diagnostics surface (leases, pin/lock owners, transport, recoverable journals).',
    },
  ],

  components: [
    {
      name: "CaptureStudio",
      filePath: "features/media-capture/components/CaptureStudio.tsx",
      description:
        "The capture workflow: preview → shutter/record → review → durable save. Photo, video, and audio modes on one engine.",
      status: "Live",
      tier: "candidate",
    },
    {
      name: "CameraPreview",
      filePath: "features/media-capture/components/CameraPreview.tsx",
      description:
        "Canonical live <video> for a camera lease (framing modes, preview-only mirror, intrinsic-size reporting). Renders only — never acquires leases.",
      status: "Live",
      tier: "candidate",
    },
    {
      name: "CaptureLibrary",
      filePath: "features/media-capture/components/CaptureLibrary.tsx",
      description:
        "The /camera management lens over Captures/* (filters, transport strip, recovery, per-tile actions).",
      status: "Live",
      tier: "internal",
    },
    {
      name: "CaptureItemActions",
      filePath: "features/media-capture/components/CaptureItemActions.tsx",
      description:
        "The ONE per-capture action menu (library tiles + Camera-tab rows): Preview / Download / Copy link / Rename / Move / Share / Transcribe / Delete, all on the canonical files action stack.",
      status: "Live",
      tier: "internal",
      notes: [
        "Move + Share are the two items FileContextMenu leaves to its host — wired here with openFolderPicker + useFileMutation and PermissionsDialog.",
        "Transcribe calls transcribeCloudFile (POST /audio/transcribe-file) by file_id; result renders through <ContentActionBar />.",
      ],
    },
    {
      name: "CaptureRecoverySection",
      filePath: "features/media-capture/components/CaptureRecoverySection.tsx",
      description:
        "Shared recoverable-journal surface (library + Camera tab): Finish & save runs the one finishJournalRecovery flow; loud 'Recovered N of M' phrasing.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "CaptureTransportStrip",
      filePath: "features/media-capture/components/CaptureTransportStrip.tsx",
      description:
        "Shared upload/transport strip (library + Camera tab): in-flight %, failed uploads with Retry from the diagnostics retry payload, TUS resume-pending.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "CaptureThumb",
      filePath: "features/media-capture/components/CaptureThumb.tsx",
      description:
        "Leaf wrapper over <InlineMediaRef> that confines the JSX ref= hand-off (keeps the React Compiler ref analysis from tainting the CloudFile object).",
      status: "Live",
      tier: "internal",
    },
    {
      name: "CaptureControls / CaptureReview / DeviceFallbackInput",
      filePath: "features/media-capture/components/",
      description:
        "Studio sub-surfaces: mode/framing controls, review playback via the audio output sink plus server-side transcription with the shared ContentActionBar, and the OS-camera fallback input (EXIF-stripped).",
      status: "Live",
      tier: "internal",
    },
    {
      name: "CaptureDeviceRail",
      filePath: "features/media-capture/components/CaptureDeviceRail.tsx",
      description:
        "Inline camera / microphone / speaker pickers in the studio, sourced from useAudioDevices() and persisted to userPreferences.mediaDevices. Renders the canonical DeviceMenuPanel popover; locks camera + mic while recording pins them.",
      status: "Live",
      tier: "official",
    },
    {
      name: "RecordingHud",
      filePath: "features/media-capture/components/RecordingHud.tsx",
      description:
        "Live recording HUD: monotonic mono-space timer, AudioLevelIndicator fed from the composed recording stream, Duration + Estimated Size gauges against the controller-enforced caps (red past 80%), near-cap alert, pause/stop/cancel.",
      status: "Live",
      tier: "official",
    },
    {
      name: "CameraControlTab",
      filePath: "features/media-capture/components/CameraControlTab.tsx",
      description:
        "Camera tab of the Media control window — live capture clock + Stop, recovery, transport, this session's captures with per-item actions; raw diagnostics collapsed behind a disclosure.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "CameraAdminDiagnostics",
      filePath: "features/media-capture/components/CameraAdminDiagnostics.tsx",
      description:
        "This page's read-only diagnostics section (MIME probes, permissions, owners, transport, failures ring).",
      status: "Live",
      tier: "internal",
    },
    {
      name: "camera-stream-manager (runtime)",
      filePath: "features/media-capture/runtime/camera-stream-manager.ts",
      description:
        "Framework-free lease/pin/reconfigure singleton — the ONE legal getUserMedia({video}) call site (ESLint-enforced).",
      status: "Live",
      tier: "internal",
    },
    {
      name: "mediaCaptureDiagnostics (runtime)",
      filePath: "features/media-capture/runtime/mediaCaptureDiagnostics.ts",
      description:
        "Framework-free diagnostics aggregator: camera state, lock/session owners, transport feed, journal summaries, bounded failure ring.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "Recording stack",
      filePath: "features/media-capture/recording/",
      description:
        "media-recorder-controller (THE MediaRecorder state machine) · chunk-journal (crash-safety IndexedDB) · video-recorder (lease pin + mic clone orchestrators) · journal-recovery (shared assemble+save).",
      status: "Live",
      tier: "internal",
    },
    {
      name: "capture-uploader",
      filePath: "features/media-capture/upload/capture-uploader.ts",
      description:
        "The ONE cloud boundary for captured bytes: validates metadata.capture, resolves Captures/* folders, uploads via fileHandler; failures land in the diagnostics ring with retry payloads.",
      status: "Live",
      tier: "internal",
    },
  ],

  demoRoutes: [
    {
      url: "/demos/media-capture",
      label: "Media capture harness",
      description:
        "Dev harness exercising the production primitives: framing modes, quality profiles, device switching, error states, leak checks.",
      filePath: "app/(dev)/demos/media-capture/page.dev.tsx",
    },
  ],

  relatedFeatures: [
    {
      name: "Files",
      description:
        "All captured bytes live in files.files via the universal handler; the /camera lens rides the cloud-files tree, uploads slice, and TUS transport.",
    },
    {
      name: "Audio",
      description:
        "Shared captureLock, micStream (mic clones for video recording), audio session registry, and output-sink review playback. The Media window hosts both.",
    },
    {
      name: "Media devices",
      description:
        "features/media-devices — the canonical device + permission manager (mic/speaker/camera pickers in the Media window's Devices tab).",
    },
    {
      name: "PDF scanner",
      description:
        "features/pdf/scanner CaptureView runs on this runtime (environment facing, full-frame WYSIWYG capture).",
    },
  ],
};

export default function CameraAdminPage() {
  return (
    <>
      {/* FeatureAdminPage performs the admin gate (redirect) server-side —
          nothing below renders for non-admins. */}
      <FeatureAdminPage map={CAMERA_ADMIN_MAP} />
      <div className="w-full px-3 pb-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Live client diagnostics (read-only — never acquires a camera)
        </h2>
        <CameraAdminDiagnostics />
      </div>
    </>
  );
}
