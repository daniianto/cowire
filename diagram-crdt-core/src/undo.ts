import * as Y from "yjs";
import { getShapesMap } from "./doc.js";

// a per-client symbol used as the transaction origin for every local edit;
// Y.UndoManager's trackedOrigins uses reference equality, so each doc/client
// needs its own instance rather than a shared constant
export const createLocalOrigin = (): symbol => Symbol("local-origin");

/**
 * An undo manager scoped to this client's own edits: `trackedOrigins`
 * ensures a locally-pressed undo never reverts a remote peer's change, since
 * remote updates are applied under a different (or no) origin.
 */
export const createLocalUndoManager = (
  doc: Y.Doc,
  localOrigin: unknown
): Y.UndoManager =>
  new Y.UndoManager(getShapesMap(doc), {
    trackedOrigins: new Set([localOrigin]),
  });
