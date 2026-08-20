/**
 * userDataThunk.test.ts — Phase 4 PR 4.B
 *
 * Covers the `setUserData` thunk that fans a legacy `Partial<UserData>`
 * payload across the new `userAuth` + `userProfile` slices.
 *
 * Critical invariants:
 *   - Auth-domain payload reaches `setUserAuth`; profile payload reaches
 *     `setUserProfile`. Neither slice is touched if its payload is empty.
 *   - Mixed payloads dispatch BOTH actions in one thunk invocation.
 *   - Empty payload is a no-op (no actions dispatched).
 */

import { configureStore } from "@reduxjs/toolkit";
import userAuthReducer from "../../slices/userAuthSlice";
import userProfileReducer from "../../slices/userProfileSlice";
import { setUserData } from "../userDataThunk";

function makeStore() {
  return configureStore({
    reducer: {
      userAuth: userAuthReducer,
      userProfile: userProfileReducer,
    },
  });
}

describe("setUserData thunk", () => {
  it("fans an auth-only payload to userAuth, leaving userProfile untouched", () => {
    const store = makeStore();
    store.dispatch(
      setUserData({
        id: "u1",
        email: "alice@example.com",
        isAdmin: true,
      }),
    );
    const s = store.getState();
    expect(s.userAuth.id).toBe("u1");
    expect(s.userAuth.email).toBe("alice@example.com");
    expect(s.userAuth.isAdmin).toBe(true);
    expect(s.userAuth.authReady).toBe(true);
    // userProfile defaults preserved
    expect(s.userProfile.userMetadata.name).toBeNull();
    expect(s.userProfile.fingerprintId).toBeNull();
  });

  it("fans a profile-only payload to userProfile, leaving userAuth untouched", () => {
    const store = makeStore();
    store.dispatch(
      setUserData({
        userMetadata: {
          avatarUrl: null,
          fullName: "Alice Anderson",
          name: "Alice",
          preferredUsername: "alice",
          picture: "p.png",
        },
      }),
    );
    const s = store.getState();
    expect(s.userProfile.userMetadata.name).toBe("Alice");
    expect(s.userProfile.userMetadata.fullName).toBe("Alice Anderson");
    expect(s.userProfile.userMetadata.picture).toBe("p.png");
    // userAuth defaults preserved
    expect(s.userAuth.id).toBeNull();
    expect(s.userAuth.authReady).toBe(false);
  });

  it("fans a mixed payload across both slices in one call", () => {
    const store = makeStore();
    store.dispatch(
      setUserData({
        id: "u1",
        accessToken: "secret",
        userMetadata: {
          avatarUrl: null,
          fullName: null,
          name: "Alice",
          preferredUsername: null,
          picture: null,
        },
      }),
    );
    const s = store.getState();
    expect(s.userAuth.id).toBe("u1");
    expect(s.userAuth.accessToken).toBe("secret");
    expect(s.userProfile.userMetadata.name).toBe("Alice");
  });

  it("empty payload is a no-op (no actions dispatched)", () => {
    const store = makeStore();
    const before = store.getState();
    store.dispatch(setUserData({}));
    const after = store.getState();
    expect(after.userAuth).toBe(before.userAuth);
    expect(after.userProfile).toBe(before.userProfile);
  });

  it("preserves earlier auth state across subsequent profile-only dispatch", () => {
    const store = makeStore();
    store.dispatch(
      setUserData({
        id: "u1",
        createdAt: "2026-08-18T00:00:00.000Z",
        isAnonymous: true,
        isAdmin: true,
      }),
    );
    expect(store.getState().userAuth.createdAt).toBe(
      "2026-08-18T00:00:00.000Z",
    );
    expect(store.getState().userAuth.isAnonymous).toBe(true);
    const authBefore = store.getState().userAuth;
    store.dispatch(
      setUserData({
        userMetadata: {
          avatarUrl: null,
          fullName: null,
          name: "Alice",
          preferredUsername: null,
          picture: null,
        },
      }),
    );
    expect(store.getState().userAuth).toBe(authBefore); // ref-equal
  });
});
