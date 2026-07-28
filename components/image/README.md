# Image Management System

> **Primary hub doc:** [`features/image-manager/FEATURE.md`](../../features/image-manager/FEATURE.md). The components in this directory power both the modal `<ImageManager>` and the full-page `/image-manager` route. For overall architecture, registry layout, selection modes, and how to add a new tab, read the FEATURE doc first.

This system provides a full-screen image picker plus a small set of helper components for displaying, selecting, and persisting images across the application. As of the cloud-files rebuild it is a first-class consumer of the `features/files` system — every upload lands in the user's cloud account, and "Your Cloud" / "All Files" / "Image Studio" all surface live cloud-files data.

## Core Components

### Context Provider

- `SelectedImagesProvider`: Manages the state of selected images across the application.
- `SelectedImagesWrapper`: A convenience wrapper component to wrap parts of the application that need access to the selected images state.

> **Note:** The `SelectedImagesProvider` is already included in the app's global providers (`app/Providers.tsx`), so you can use the `useSelectedImages` hook anywhere without additional setup.

### User Interface Components

- `ImageManager`: The main full-screen image picker. Tabs:
  - **Public Images** — Unsplash search (unchanged).
  - **My Images** — live, searchable image-MIME view of the user's cloud files. Has a Recents (last 30 days) chip and merges any legacy `userImages` URLs as a "Provided" section.
  - **My Files** — full cloud-files browser (folders + files). Selectability is gated by `allowFileTypes` (default `["image"]`).
  - **Upload** — single consolidated upload surface. Drag-and-drop, paste-from-clipboard, OS file picker — all flow through the cloud-files `useFileUpload` hook with live progress, duplicate detection, and a folder selector.
  - **Image Studio** — embeds `<EmbeddedImageStudio>` for crop + preset variants. Saved variants get permanent CDN URLs and are auto-added to the selection.
  - **AI Generate** — placeholder for the upcoming agent-driven image generation surface.

- `ImagePreviewRow`: Responsive row component for displaying selected image previews.
- `SelectableImageCard`: Wrapper that adds selection state to any image component.

## How to Use

### Basic Usage

```tsx
import { useSelectedImages } from "@/components/image/context/SelectedImagesProvider";
import { ImagePreviewRow } from "@/components/image/shared/ImagePreviewRow";

function MyComponent() {
  const { selectedImages, clearImages } = useSelectedImages();

  return (
    <div>
      <p>Selected Images: {selectedImages.length}</p>
      <ImagePreviewRow size="m" />
      <button onClick={clearImages}>Clear All</button>
    </div>
  );
}
```

### Using the Image Manager

```tsx
import { useState } from "react";
import { ImageManager } from "@/components/image/ImageManager";

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button onClick={() => setIsOpen(true)}>Pick image</button>
      <ImageManager
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialSelectionMode="multiple"
        defaultUploadFolderPath="Images/Uploads"
        allowFileTypes={["image"]}
      />
    </>
  );
}
```

### Cloud-files props (all optional)

| Prop | Default | Description |
| --- | --- | --- |
| `allowFileTypes` | `["image"]` | Which file kinds are selectable from "My Files". Pass `["image", "video"]`, `["any"]`, etc. |
| `defaultUploadFolderPath` | `"Images/Uploads"` | Logical slash-delimited path for new uploads. Auto-created if missing. |
| `defaultUploadFolderId` | `null` | Pre-resolved folder id (skips path resolution). |
| `defaultVisibility` | `"private"` | Visibility for new uploads. The Image Studio overrides to `"public"`. |
| `showImageStudioTab` | `true` | Hide the Image Studio tab when irrelevant. |
| `showAIGenerateTab` | `true` | Hide the AI Generate placeholder tab. |
| `imageStudioProps` | — | Override any `<EmbeddedImageStudio>` prop (presets, primary, root segment, etc.). |

### Legacy props — still supported

The following props are mapped onto the cloud-files folder system so existing callers keep working:

| Legacy prop | Mapped to |
| --- | --- |
| `saveTo: "public"` | `defaultUploadFolderPath="Images/Uploads/Public"`, visibility `"public"` |
| `saveTo: "private"` | `defaultUploadFolderPath="Images/Uploads/Private"`, visibility `"private"` |
| `bucket` + `path` | `defaultUploadFolderPath="${bucket}/${path}"` |
| `userImages` | Rendered as a "Provided" section above the cloud results in "My Images" |
| Tab IDs (`user-images`, `upload-images`, `paste-images`, `quick-upload`, `cloud-images`, `image-generation`) | Aliased to their replacements (`my-images`, `upload`, `my-files`, `ai-generate`) for both `initialTab` and `visibleTabs`. |

### For Local State Management

If you need isolated image selection state for a specific part of your application, use the wrapper component:

```tsx
import { SelectedImagesWrapper } from "@/components/image/context/SelectedImagesWrapper";

function MyPageWithLocalState() {
  return (
    <SelectedImagesWrapper>
      <MyComponent />
    </SelectedImagesWrapper>
  );
}
```

## Tab IDs

| Tab | ID |
| --- | --- |
| Public Images | `public-search` |
| My Images | `my-images` |
| My Files | `my-files` |
| Upload | `upload` |
| Image Studio | `image-studio` |
| AI Generate | `ai-generate` |

## Size Variants

The `ImagePreviewRow` component supports 5 size variants: `xs`, `s`, `m`, `lg`, `xl`.

## Selection Modes

- `single`: Only one image can be selected at a time
- `multiple`: Multiple images can be selected
- `none`: Browse mode — selection state is hidden, clicks fall through to the host's `onClick` handler (used by `SelectableImageCard`). The `/image-manager` route uses this for "browse" semantics.

Set via `setSelectionMode` from `useSelectedImages`.

> Some current cloud tabs (`CloudImagesTab`, `CloudFilesTab`) still hardcode toggle-on-click and don't honor `none` yet — this is on the roadmap. See the route's section-mode notes in `app/(a)/image-manager/_components/ImageManagerPageShell.tsx`.

## Image Data Structure

Each image is represented as an `ImageSource`:

```typescript
interface ImageSource {
  type: "public" | "temporary" | "local" | "bucket" | "cloud-file";
  url: string;
  id: string;
  metadata?: {
    description?: string;
    title?: string;
    fileId?: string; // present when type === "cloud-file"
    mimeType?: string;
    fileSize?: number;
    urlExpiresAt?: number | null; // null = permanent CDN URL
    [key: string]: any;
  };
}
```

For cloud files, the URL is pre-resolved at selection time:

- `publicUrl` (CDN) → permanent URL, `urlExpiresAt: null`.
- Private files → 1-hour signed URL via `getSignedUrl`. Refresh by re-resolving with `metadata.fileId`.

The resolver lives at `components/image/cloud/resolveCloudFileUrl.ts`.

## Deprecated Files

- `components/image/ImageManager.tsx` — the current modal entry point. The pre-cloud-files `ImageManagerContent.tsx` legacy file was removed in the Image Manager Hub plan; an `ImageManagerContent` alias is still re-exported from `ImageManager.tsx` for backwards-compat but is marked `@deprecated`.
