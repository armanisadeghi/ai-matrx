"use client";

// CardImageSlot — the editor's per-card image affordance (closes the editor's
// declared "image attachments" fast-follow). One row per face: the current
// image (canonical FlashcardFaceImage), plus the lanes —
//
//   FREE (no metering, no AI spend):
//   Upload  → the learner's own picture through the canonical file primitive
//             (`useFileUpload`). Uploaded PUBLIC on purpose: cards are
//             shareable and public sets render for anonymous visitors, so the
//             face needs a permanent CDN URL, never a signed one. We stamp
//             BOTH `image_file_id` (our identity) and `image_url` (the durable
//             public URL) — the anon RPC and print lanes can only use the URL.
//             ("Images are born public" — VISION_AND_PLAN §2.1.)
//   Photo   → the free Unsplash stock lane (`UnsplashPickDialog` on the shared
//             `lib/media/unsplash` primitive). Stores the permanent Unsplash
//             CDN URL plus `metadata.credit` {name,url}, which renders under
//             the image — attribution is an Unsplash ToS requirement, and the
//             download event fires on attach (use), not on browsing.
//
//   METERED (AI spend):
//   Find    → the web-sourcing lane (agent searches, judges the source, picks
//             or refuses) — aidream POST /education/images/source-card
//   Generate→ the verified generation lane (describe → generate →
//             adversarially judge → retry → refuse) — /generate-card
//
//   Remove  → soft-deletes the face's image rows (fcService.removeCardImage)
//
// Both AI lanes are METERED: guard() checks the plan BEFORE the spend and
// opens the respectful paywall on a cap; usage is recorded server-side. An
// agent is never forced to attach — a refusal shows its reasoning as a toast.
// The free lanes carry no entitlement guard by design.
//
// ALT TEXT IS REQUIRED on every lane — education is unusable without it, so
// both free lanes confirm it with the user (pre-filled, never empty).
// Cross-repo contract: common-docs/systems/education/flashcard-images/VISION_AND_PLAN.md.

import { useRef, useState } from "react";
import {
  Globe,
  Image as ImageIcon,
  Images,
  Loader2,
  Trash2,
  Upload,
  BrainCircuit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { isSignedUrl } from "@/lib/media/signed-url";
import type { UnsplashPick } from "@/lib/media/unsplash";
import { trackUnsplashUse } from "@/lib/media/unsplash";
import { UnsplashPickDialog } from "./UnsplashPickDialog";
import {
  FlashcardFaceImage,
  type FaceImageRef,
} from "@/components/mardown-display/blocks/flashcards/FlashcardFaceImage";
import { fcService } from "../../data/fcService";
import { getCardImages } from "../study/cardImages";
import type { CardWithDetails } from "../../data/types";

type Face = "front" | "back";

/** Where uploaded card pictures land in the learner's own Files. */
const UPLOAD_FOLDER = "Images/Flashcards";

/** Alt text seed: the face's own words, trimmed to something readable. */
function altSeed(text: string | null | undefined, fallback: string): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length > 120 ? `${clean.slice(0, 117)}...` : clean;
}

interface LaneEventPayload {
  refused?: boolean;
  reason?: string;
  result?: {
    attached?: boolean;
    refusal_reason?: string;
    judgment?: { reasoning?: string } | null;
    verdict?: { reasoning?: string } | null;
  };
}

function FaceRow({
  card,
  face,
  image,
  onChanged,
}: {
  card: CardWithDetails;
  face: Face;
  image: FaceImageRef | undefined;
  onChanged: () => void;
}) {
  const dispatch = useAppDispatch();
  const source = useEntitlementGuard("education.card_image_source");
  const generate = useEntitlementGuard("education.card_image_generate");
  const { upload } = useFileUpload();
  const [busy, setBusy] = useState<
    "find" | "generate" | "remove" | "upload" | "stock" | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [altOpen, setAltOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);

  const faceText = face === "front" ? card.front : card.back;
  const seed = altSeed(faceText, "Card image");

  /** FREE lane 1 — the learner's own picture. */
  const uploadPicked = async (alt: string) => {
    const file = pendingFile;
    if (!file) return;
    setBusy("upload");
    try {
      // PUBLIC on purpose: a card image must survive being shared and must
      // render for anonymous visitors on a public set, so it needs the
      // permanent CDN URL a public file carries.
      const uploaded = await upload({ kind: "file", file }, {
        visibility: "public",
        folderPath: UPLOAD_FOLDER,
        fileName: file.name,
      });
      const durableUrl =
        uploaded.url && !isSignedUrl(uploaded.url) ? uploaded.url : undefined;
      if (!durableUrl) {
        // Never store a signed URL. The file_id still renders for the owner
        // and every signed-in sharee; only anonymous surfaces lose out, and
        // that is worth saying out loud rather than silently persisting rot.
        console.warn(
          "[CardImageSlot] upload produced no durable public URL; storing file_id only",
          { fileId: uploaded.fileId, url: uploaded.url },
        );
        toast.info("Picture attached, but anonymous visitors may not see it.");
      }
      const res = await fcService.setCardImage(card.id, face, {
        file_id: uploaded.fileId,
        url: durableUrl,
        alt,
        generated_by: "user",
        metadata: { source: "upload" },
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setAltOpen(false);
      setPendingFile(null);
      toast.success("Picture attached");
      onChanged();
    } catch (e) {
      toast.error(
        `Couldn't upload that picture: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(null);
    }
  };

  /** FREE lane 2 — Unsplash stock, credited. */
  const attachStock = async (pick: UnsplashPick, alt: string) => {
    setBusy("stock");
    try {
      const res = await fcService.setCardImage(card.id, face, {
        // Unsplash's own CDN URL is permanent and anonymous-readable.
        url: pick.url,
        alt,
        generated_by: "user",
        metadata: {
          source: "stock",
          provider: "unsplash",
          provider_photo_id: pick.id,
          credit: { name: pick.credit.name, url: pick.credit.url ?? null },
        },
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      // Unsplash ToS: register the download when the photo is actually used.
      trackUnsplashUse(pick);
      setStockOpen(false);
      toast.success("Photo attached");
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const runLane = async (
    lane: "find" | "generate",
    path: "/education/images/source-card" | "/education/images/generate-card",
  ) => {
    setBusy(lane);
    try {
      let payload: LaneEventPayload | null = null;
      const res = await dispatch(
        callApi({
          path,
          method: "POST",
          body: { card_id: card.id, face },
          stream: true,
          onStreamEvent: (event) => {
            const data = (event as { data?: LaneEventPayload }).data;
            if (data && (data.refused || data.result)) payload = data;
          },
        }),
      );
      if (res.error) {
        toast.error(
          `Couldn't ${lane === "find" ? "find" : "generate"} an image: ${res.error.message}`,
        );
        return;
      }
      const lanePayload = payload as LaneEventPayload | null;
      if (lanePayload?.refused) {
        // Cap/tier refusal decided server-side — show the paywall via a fresh
        // client-side check (same verdict source of truth).
        toast.info("Your plan's image limit was reached for now.");
        return;
      }
      const result = lanePayload?.result;
      if (result?.attached) {
        (lane === "find" ? source : generate).commit();
        toast.success(lane === "find" ? "Expert image attached" : "Verified image attached");
        onChanged();
      } else {
        // The agent refused — a respected outcome, explained, never silent.
        const why =
          result?.refusal_reason ||
          result?.judgment?.reasoning ||
          result?.verdict?.reasoning ||
          "No image cleared the quality bar for this card.";
        toast.info(`No image attached: ${why}`);
      }
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    try {
      const res = await fcService.removeCardImage(card.id, face);
      if (res.error) toast.error(res.error);
      else onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
        {face}
      </span>
      {image ? (
        <FlashcardFaceImage image={image} size="thumb" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-dashed border-border text-muted-foreground/50">
          <ImageIcon className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {image?.alt || (image ? "Card image" : "No image")}
      </span>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Clear immediately so picking the same file twice still fires.
          e.target.value = "";
          if (!file) return;
          setPendingFile(file);
          setAltOpen(true);
        }}
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        disabled={busy !== null}
        title={`Upload your own picture for the ${face}`}
        aria-label={`Upload your own picture for the ${face}`}
        onClick={() => fileInputRef.current?.click()}
      >
        {busy === "upload" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        disabled={busy !== null}
        title={`Pick a free stock photo for the ${face}`}
        aria-label={`Pick a free stock photo for the ${face}`}
        onClick={() => setStockOpen(true)}
      >
        {busy === "stock" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Images className="h-3.5 w-3.5" />
        )}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        disabled={busy !== null || source.isChecking}
        onClick={() => void source.guard(() => runLane("find", "/education/images/source-card"))}
        title="An agent finds an expert image on the open web and judges the source"
        aria-label={`Find an expert image for the ${face}`}
      >
        {busy === "find" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Globe className="h-3.5 w-3.5" />
        )}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        disabled={busy !== null || generate.isChecking}
        onClick={() =>
          void generate.guard(() => runLane("generate", "/education/images/generate-card"))
        }
        title="Generate an image and adversarially verify its accuracy before attaching"
        aria-label={`Generate an image for the ${face}`}
      >
        {busy === "generate" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <BrainCircuit className="h-3.5 w-3.5" />
        )}
      </Button>
      {image && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          title={`Remove ${face} image`}
          aria-label={`Remove ${face} image`}
          disabled={busy !== null}
          onClick={() => void remove()}
        >
          {busy === "remove" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
      <source.Paywall />
      <generate.Paywall />
      <TextInputDialog
        open={altOpen}
        onOpenChange={(o) => {
          if (busy === "upload") return;
          setAltOpen(o);
          if (!o) setPendingFile(null);
        }}
        title="Describe the picture"
        description="Alt text is read aloud by screen readers and shown if the image can't load."
        placeholder="A labeled diagram of a plant cell"
        defaultValue={seed}
        confirmLabel="Attach picture"
        busy={busy === "upload"}
        onConfirm={(alt) => void uploadPicked(alt)}
      />
      <UnsplashPickDialog
        open={stockOpen}
        onOpenChange={setStockOpen}
        defaultQuery={seed}
        onAttach={attachStock}
      />
    </div>
  );
}

export function CardImageSlot({
  card,
  onChanged,
}: {
  card: CardWithDetails;
  onChanged: () => void;
}) {
  const images = getCardImages(card);
  return (
    <div className="mt-2 space-y-1.5 border-t border-border pt-2">
      <FaceRow card={card} face="front" image={images.front} onChanged={onChanged} />
      <FaceRow card={card} face="back" image={images.back} onChanged={onChanged} />
    </div>
  );
}

export default CardImageSlot;
