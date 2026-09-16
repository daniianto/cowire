import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import {
  createDiagramDoc,
  getAllShapes,
  removeShape,
  replaceAllShapes,
  setShape,
  updateManyShapeFields,
  updateShapeFields,
  type ShapeRecord,
} from "../src/doc";

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

// syncs b to have everything a has (and vice versa), the way two connected
// clients converge in the real app
const sync = (a: Y.Doc, b: Y.Doc): void => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
};

describe("setShape / getAllShapes", () => {
  it("round-trips a shape's fields", () => {
    const doc = createDiagramDoc();
    setShape(doc, "r1", rect);
    expect(getAllShapes(doc)).toEqual({ r1: rect });
  });

  it("removes a shape", () => {
    const doc = createDiagramDoc();
    setShape(doc, "r1", rect);
    removeShape(doc, "r1");
    expect(getAllShapes(doc)).toEqual({});
  });

  it("updates fields on several shapes in one transaction", () => {
    const doc = createDiagramDoc();
    setShape(doc, "r1", rect);
    setShape(doc, "r2", { ...rect, id: "r2" });
    updateManyShapeFields(doc, {
      r1: { zIndex: 5 },
      r2: { zIndex: 6 },
    });
    const shapes = getAllShapes(doc);
    expect(shapes.r1.zIndex).toBe(5);
    expect(shapes.r2.zIndex).toBe(6);
  });

  it("replaces every shape wholesale", () => {
    const doc = createDiagramDoc();
    setShape(doc, "stale", rect);
    const r2 = { ...rect, id: "r2" };
    replaceAllShapes(doc, { r2 });
    expect(getAllShapes(doc)).toEqual({ r2 });
  });
});

describe("concurrent edit merging", () => {
  it("merges edits to different fields of the same shape from two docs", () => {
    const docA = createDiagramDoc();
    setShape(docA, "r1", rect);
    const docB = createDiagramDoc();
    sync(docA, docB);

    // A resizes width, B repositions x - at the same time, before either sees
    // the other's change
    updateShapeFields(docA, "r1", { width: 99 });
    updateShapeFields(docB, "r1", { x: 42 });

    sync(docA, docB);

    const expected = { ...rect, width: 99, x: 42 };
    expect(getAllShapes(docA).r1).toEqual(expected);
    expect(getAllShapes(docB).r1).toEqual(expected);
  });

  it("merges a shape created on one doc into another", () => {
    const docA = createDiagramDoc();
    const docB = createDiagramDoc();

    setShape(docA, "r1", rect);
    sync(docA, docB);

    expect(getAllShapes(docB)).toEqual({ r1: rect });
  });

  it("merges a deletion made on one doc into another", () => {
    const docA = createDiagramDoc();
    setShape(docA, "r1", rect);
    const docB = createDiagramDoc();
    sync(docA, docB);

    removeShape(docA, "r1");
    sync(docA, docB);

    expect(getAllShapes(docA)).toEqual({});
    expect(getAllShapes(docB)).toEqual({});
  });
});
