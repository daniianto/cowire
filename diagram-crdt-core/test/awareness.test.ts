import { describe, it, expect } from "vitest";
import {
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
} from "y-protocols/awareness";
import { createDiagramDoc } from "../src/doc";
import {
  colorForUserId,
  createLocalAwareness,
  getPeerStates,
  setLocalCursor,
  setLocalUser,
} from "../src/awareness";

// mirrors how the wrapper relays awareness changes between real clients
const sync = (
  from: ReturnType<typeof createLocalAwareness>,
  to: ReturnType<typeof createLocalAwareness>
) => {
  const update = encodeAwarenessUpdate(from, [from.clientID]);
  applyAwarenessUpdate(to, update, "remote");
};

describe("colorForUserId", () => {
  it("is deterministic for the same id", () => {
    expect(colorForUserId("user-1")).toBe(colorForUserId("user-1"));
  });

  it("varies across different ids (not guaranteed, but true for these)", () => {
    expect(colorForUserId("user-1")).not.toBe(colorForUserId("user-2"));
  });
});

describe("awareness peer states", () => {
  it("excludes this client's own state", () => {
    const docA = createDiagramDoc();
    const awarenessA = createLocalAwareness(docA);
    setLocalUser(awarenessA, "u1", "a@example.com", "#f87171");
    expect(getPeerStates(awarenessA)).toEqual([]);
  });

  it("surfaces a peer's user info and cursor after syncing", () => {
    const docA = createDiagramDoc();
    const awarenessA = createLocalAwareness(docA);
    setLocalUser(awarenessA, "u1", "a@example.com", "#f87171");
    setLocalCursor(awarenessA, { x: 10, y: 20 });

    const docB = createDiagramDoc();
    const awarenessB = createLocalAwareness(docB);
    setLocalUser(awarenessB, "u2", "b@example.com", "#60a5fa");

    sync(awarenessA, awarenessB);

    expect(getPeerStates(awarenessB)).toEqual([
      {
        userId: "u1",
        email: "a@example.com",
        color: "#f87171",
        cursor: { x: 10, y: 20 },
      },
    ]);
  });

  it("ignores a peer that hasn't set a user yet", () => {
    const docA = createDiagramDoc();
    const awarenessA = createLocalAwareness(docA);
    // cursor set without setLocalUser first - shouldn't surface to peers
    setLocalCursor(awarenessA, { x: 1, y: 1 });

    const docB = createDiagramDoc();
    const awarenessB = createLocalAwareness(docB);
    sync(awarenessA, awarenessB);

    expect(getPeerStates(awarenessB)).toEqual([]);
  });
});
