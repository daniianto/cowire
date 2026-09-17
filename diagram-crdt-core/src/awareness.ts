import type * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";

export type { Awareness } from "y-protocols/awareness";

export type CursorPosition = { x: number; y: number };

export type PeerAwarenessState = {
  userId: string;
  email: string;
  color: string;
  cursor: CursorPosition | null;
};

// small fixed palette, not user-chosen - see colorForUserId
const COLOR_PALETTE = [
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#a3e635",
  "#34d399",
  "#22d3ee",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
];

/** Deterministic per-user color: the same person gets the same color every session, without a database column for it. */
export const colorForUserId = (userId: string): string => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
};

export const createLocalAwareness = (doc: Y.Doc): Awareness =>
  new Awareness(doc);

export const setLocalUser = (
  awareness: Awareness,
  userId: string,
  email: string,
  color: string
): void => {
  awareness.setLocalStateField("userId", userId);
  awareness.setLocalStateField("email", email);
  awareness.setLocalStateField("color", color);
};

export const setLocalCursor = (
  awareness: Awareness,
  cursor: CursorPosition | null
): void => {
  awareness.setLocalStateField("cursor", cursor);
};

/** Every other client's current awareness state - excludes this client's own entry and any peer that hasn't set a user yet. */
export const getPeerStates = (awareness: Awareness): PeerAwarenessState[] => {
  const states: PeerAwarenessState[] = [];
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return;
    if (!state.userId) return;
    states.push({
      userId: state.userId,
      email: state.email,
      color: state.color,
      cursor: state.cursor ?? null,
    });
  });
  return states;
};
