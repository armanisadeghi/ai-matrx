// features/esign/signature-creator/mocks/mockDoor.ts — the creator's in-memory stand-in for the
// contract's handoff doors (CONTRACT §17.4): `handoffStatus` completes 6 s after the handoff opens.
// Imported only by the (dev) demo. Delete with the demo once the lane's swap is verified live.

import type { SignerDoorApi } from "../../contract/signerDoor";
import { savedSignaturesApi, type SavedSignature, type SavedSignaturesApi } from "../services";

// A hand-drawn-looking squiggle as a tiny transparent PNG made in the browser at call time.
function squiggle(): string {
  const c = document.createElement("canvas");
  c.width = 600;
  c.height = 200;
  const x = c.getContext("2d")!;
  x.strokeStyle = "#0d2673";
  x.lineWidth = 6;
  x.lineCap = "round";
  x.beginPath();
  x.moveTo(30, 140);
  x.bezierCurveTo(100, 20, 160, 190, 230, 80);
  x.bezierCurveTo(280, 10, 330, 170, 420, 70);
  x.bezierCurveTo(470, 20, 520, 120, 570, 60);
  x.stroke();
  return c.toDataURL("image/png").split(",")[1];
}

export function makeMockDoor(): SignerDoorApi {
  const started = new Map<string, number>();
  let seq = 0;
  const door = {
    seat: "signed_in" as const,
    async handoffStart() {
      const id = `mock-handoff-${++seq}`;
      started.set(id, Date.now());
      return {
        handoff_id: id,
        path: "/x/sign/phone#h=mock-secret-not-a-real-link",
        secret: "mock-secret-not-a-real-link",
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      };
    },
    async handoffText(_id: string, _secret: string, phone: string) {
      return { last4: phone.slice(-4) };
    },
    async handoffStatus(id: string) {
      const t = started.get(id);
      if (t === undefined) return { status: "expired" as const };
      const age = Date.now() - t;
      if (age < 3000) return { status: "waiting" as const };
      if (age < 6000) return { status: "opened" as const };
      return { status: "completed" as const, image_base64: squiggle(), mime_type: "image/png", method: "drawn" as const };
    },
    async handoffCancel() {},
  };
  return door as unknown as SignerDoorApi;
}

export function installMockSavedList(): () => void {
  let rows: SavedSignature[] = [
    {
      id: "s1", target: "signature", kind: "typed", typed_text: "Ada Lovelace", typed_style: "great_vibes",
      image_file_id: "f1", is_default: true, label: null, created_at: "2026-10-01T00:00:00Z",
    },
    {
      id: "s2", target: "signature", kind: "typed", typed_text: "Ada Lovelace", typed_style: "homemade_apple",
      image_file_id: "f2", is_default: false, label: null, created_at: "2026-10-02T00:00:00Z",
    },
    {
      id: "s3", target: "initials", kind: "typed", typed_text: "AL", typed_style: "allura",
      image_file_id: "f3", is_default: true, label: null, created_at: "2026-10-02T00:00:00Z",
    },
  ];
  const original: SavedSignaturesApi = { ...savedSignaturesApi };
  savedSignaturesApi.list = async () => rows.map((r) => ({ ...r }));
  savedSignaturesApi.setDefault = async (id) => {
    const target = rows.find((r) => r.id === id)?.target;
    rows = rows.map((r) => (r.target === target ? { ...r, is_default: r.id === id } : r));
  };
  savedSignaturesApi.remove = async (id) => {
    rows = rows.filter((r) => r.id !== id);
  };
  return () => Object.assign(savedSignaturesApi, original);
}
