import { describe, it, expect } from "vitest";
import {
  createDiagramDoc,
  getAllShapes,
  setShape,
  updateShapeFields,
  type ShapeRecord,
} from "../src/doc";
import { createLocalOrigin, createLocalUndoManager } from "../src/undo";

const rect: ShapeRecord = {
  id: "r1",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  zIndex: 0,
  groupId: null,
  color: "#000",
};

describe("createLocalUndoManager", () => {
  it("undoes and redoes a plain local edit", () => {
    const doc = createDiagramDoc();
    const localOrigin = createLocalOrigin();
    const undoManager = createLocalUndoManager(doc, localOrigin);

    setShape(doc, "r1", rect, localOrigin);
    undoManager.undo();
    expect(getAllShapes(doc)).toEqual({});

    undoManager.redo();
    expect(getAllShapes(doc)).toEqual({ r1: rect });
  });

  it("never undoes a remote peer's edit, even interleaved with local ones", () => {
    const doc = createDiagramDoc();
    const localOrigin = createLocalOrigin();
    const undoManager = createLocalUndoManager(doc, localOrigin);

    setShape(doc, "r1", rect, localOrigin);
    undoManager.stopCapturing();

    updateShapeFields(doc, "r1", { x: 99 }, localOrigin);
    undoManager.stopCapturing();

    // a remote peer's edit lands under a different origin, in between the
    // local client's own edits
    updateShapeFields(doc, "r1", { width: 50 }, "remote-peer");

    undoManager.undo();

    const shapes = getAllShapes(doc);
    // the local x edit is reverted...
    expect(shapes.r1.x).toBe(0);
    // ...but the remote's width edit survives untouched, unlike a hand-rolled
    // snapshot-based undo that would have reverted to a full prior state and
    // silently discarded it
    expect(shapes.r1.width).toBe(50);
  });

  it("stopCapturing groups edits before/after it into separate undo steps", () => {
    const doc = createDiagramDoc();
    const localOrigin = createLocalOrigin();
    const undoManager = createLocalUndoManager(doc, localOrigin);

    setShape(doc, "r1", rect, localOrigin);
    undoManager.stopCapturing();

    updateShapeFields(doc, "r1", { x: 10 }, localOrigin);
    updateShapeFields(doc, "r1", { x: 20 }, localOrigin);
    updateShapeFields(doc, "r1", { x: 30 }, localOrigin);

    // one gesture (no stopCapturing between these three updates) undoes as
    // a single step - the exact behavior commitHistory()/gesture-boundary
    // commits relied on in Stage 2
    undoManager.undo();
    expect(getAllShapes(doc).r1.x).toBe(0);
  });
});
