/**
 * overlaySlice.test.ts — reducer behavior, including the Phase 4 additions
 * (lastUsedAt, delete-on-close for multi-instance, closeAllInstancesOfOverlay,
 * pruneStaleInstances).
 */
import reducer, {
  openOverlay,
  closeOverlay,
  closeAllOverlays,
  toggleOverlay,
  closeAllInstancesOfOverlay,
  pruneStaleInstances,
  DEFAULT_INSTANCE_ID,
} from "@/lib/redux/slices/overlaySlice";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";

// Test fixtures use synthetic ids ("x", "multi", "other", "singleton") to
// validate reducer behavior independently of the real registry. Cast them
// through the OverlayId type so the type narrowing in the public action
// signatures doesn't reject the tests.
const xId = "x" as unknown as OverlayId;
const multiId = "multi" as unknown as OverlayId;
const otherId = "other" as unknown as OverlayId;
const singletonId = "singleton" as unknown as OverlayId;

// Reducer is the default export; slice exports actions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (state: any, action: any) => reducer(state, action);

const emptyState = () => ({ overlays: {} });

describe("overlaySlice", () => {
  describe("initial state", () => {
    it("is empty (no pre-seeded keys)", () => {
      // Running a no-op returns initial state
      const s = reducer(undefined, { type: "@@INIT" });
      expect(s).toEqual({ overlays: {} });
    });
  });

  describe("openOverlay", () => {
    it("creates a singleton bucket and sets lastUsedAt", () => {
      const s = run(
        emptyState(),
        openOverlay({ overlayId: "notesWindow", data: { foo: "bar" } }),
      );
      const inst = s.overlays.notesWindow[DEFAULT_INSTANCE_ID];
      expect(inst.isOpen).toBe(true);
      expect(inst.data).toEqual({ foo: "bar" });
      expect(typeof inst.lastUsedAt).toBe("number");
    });

    it("supports multiple instances of the same overlay", () => {
      let s = run(
        emptyState(),
        openOverlay({ overlayId: xId, instanceId: "i1" }),
      );
      s = run(s, openOverlay({ overlayId: xId, instanceId: "i2" }));
      expect(Object.keys(s.overlays.x).sort()).toEqual(["i1", "i2"]);
    });
  });

  describe("closeOverlay", () => {
    it("flips singleton to closed (retains slot)", () => {
      let s = run(emptyState(), openOverlay({ overlayId: "notesWindow" }));
      s = run(s, closeOverlay({ overlayId: "notesWindow" }));
      expect(s.overlays.notesWindow[DEFAULT_INSTANCE_ID].isOpen).toBe(false);
    });

    it("deletes multi-instance entry entirely", () => {
      let s = run(
        emptyState(),
        openOverlay({
          overlayId: "contentEditorWindow",
          instanceId: "inst-42",
        }),
      );
      expect(s.overlays.contentEditorWindow["inst-42"]).toBeDefined();
      s = run(
        s,
        closeOverlay({
          overlayId: "contentEditorWindow",
          instanceId: "inst-42",
        }),
      );
      // Bucket is GC'd when empty
      expect(s.overlays.contentEditorWindow).toBeUndefined();
    });

    it("no-op for unknown overlay/instance", () => {
      const s = run(
        emptyState(),
        closeOverlay({
          overlayId: "nope" as unknown as OverlayId,
          instanceId: "z",
        }),
      );
      expect(s).toEqual(emptyState());
    });
  });

  describe("closeAllOverlays", () => {
    it("closes singletons, deletes multi-instance entries", () => {
      let s = run(emptyState(), openOverlay({ overlayId: singletonId }));
      s = run(s, openOverlay({ overlayId: multiId, instanceId: "m1" }));
      s = run(s, openOverlay({ overlayId: multiId, instanceId: "m2" }));
      s = run(s, closeAllOverlays());
      expect(s.overlays.singleton[DEFAULT_INSTANCE_ID].isOpen).toBe(false);
      expect(s.overlays.multi).toBeUndefined();
    });
  });

  describe("toggleOverlay", () => {
    it("opens when closed", () => {
      const s = run(emptyState(), toggleOverlay({ overlayId: "notesWindow" }));
      expect(s.overlays.notesWindow[DEFAULT_INSTANCE_ID].isOpen).toBe(true);
    });

    it("closes when open (singleton)", () => {
      let s = run(emptyState(), openOverlay({ overlayId: "notesWindow" }));
      s = run(s, toggleOverlay({ overlayId: "notesWindow" }));
      expect(s.overlays.notesWindow[DEFAULT_INSTANCE_ID].isOpen).toBe(false);
    });

    it("closes + removes multi-instance when open", () => {
      let s = run(
        emptyState(),
        openOverlay({ overlayId: xId, instanceId: "y" }),
      );
      s = run(s, toggleOverlay({ overlayId: xId, instanceId: "y" }));
      expect(s.overlays.x).toBeUndefined();
    });
  });

  describe("closeAllInstancesOfOverlay", () => {
    it("removes every instance of a given overlay", () => {
      let s = run(
        emptyState(),
        openOverlay({ overlayId: xId, instanceId: "a" }),
      );
      s = run(s, openOverlay({ overlayId: xId, instanceId: "b" }));
      s = run(s, openOverlay({ overlayId: otherId }));
      s = run(s, closeAllInstancesOfOverlay({ overlayId: xId }));
      expect(s.overlays.x).toBeUndefined();
      // Untouched overlay still there
      expect(s.overlays.other).toBeDefined();
    });
  });

  describe("pruneStaleInstances", () => {
    it("removes closed multi-instance entries older than threshold", () => {
      // Open two instances, close one
      let s = run(
        emptyState(),
        openOverlay({ overlayId: xId, instanceId: "a" }),
      );
      s = run(s, openOverlay({ overlayId: xId, instanceId: "b" }));
      s = run(s, closeOverlay({ overlayId: xId, instanceId: "a" }));
      // "a" was deleted immediately by closeOverlay — so that's already GC'd.
      // Simulate a legacy stale entry: manually insert a closed multi-instance
      // entry with an old timestamp.
      s = {
        overlays: {
          x: {
            b: s.overlays.x.b,
            legacy: {
              isOpen: false,
              data: null,
              lastUsedAt: Date.now() - 1000 * 60 * 60, // 1h ago
            },
          },
        },
      };

      s = run(s, pruneStaleInstances({ olderThanMs: 30 * 60 * 1000 })); // 30min
      expect(s.overlays.x.legacy).toBeUndefined();
      // The still-open instance survives
      expect(s.overlays.x.b).toBeDefined();
    });

    it("never removes singleton slots, even when stale", () => {
      let s = run(emptyState(), openOverlay({ overlayId: "notesWindow" }));
      s = run(s, closeOverlay({ overlayId: "notesWindow" }));
      // Manually age the singleton timestamp
      s = {
        overlays: {
          notesWindow: {
            [DEFAULT_INSTANCE_ID]: {
              ...s.overlays.notesWindow[DEFAULT_INSTANCE_ID],
              lastUsedAt: Date.now() - 1000 * 60 * 60,
            },
          },
        },
      };
      s = run(s, pruneStaleInstances({ olderThanMs: 30 * 60 * 1000 }));
      // Singleton slot retained
      expect(s.overlays.notesWindow[DEFAULT_INSTANCE_ID]).toBeDefined();
    });

    it("keeps closed instances younger than threshold", () => {
      let s = run(
        emptyState(),
        openOverlay({ overlayId: xId, instanceId: "recent" }),
      );
      // Mark closed but recent
      s = {
        overlays: {
          x: {
            recent: {
              isOpen: false,
              data: null,
              lastUsedAt: Date.now() - 1000, // 1 second ago
            },
          },
        },
      };
      s = run(s, pruneStaleInstances({ olderThanMs: 30 * 60 * 1000 }));
      expect(s.overlays.x.recent).toBeDefined();
    });

    it("cleans up empty buckets after pruning last entry", () => {
      let s: {
        overlays: Record<
          string,
          Record<
            string,
            { isOpen: boolean; data: unknown; lastUsedAt?: number }
          >
        >;
      } = {
        overlays: {
          x: {
            onlyOne: {
              isOpen: false,
              data: null,
              lastUsedAt: Date.now() - 1000 * 60 * 60,
            },
          },
        },
      };
      s = run(s, pruneStaleInstances({ olderThanMs: 30 * 60 * 1000 }));
      expect(s.overlays.x).toBeUndefined();
    });
  });
});
