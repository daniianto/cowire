import * as Y from "yjs";

// a shape's fields are all flat JSON-compatible scalars (see Shape in
// diagram-front-react/src/lib/geometry.ts) - crdt-core stays generic over
// that shape, rather than depending on the front-end's concrete type
export type JsonScalar = string | number | boolean | null;
export type ShapeRecord = Record<string, JsonScalar>;

export const createDiagramDoc = (): Y.Doc => new Y.Doc();

export const getShapesMap = (doc: Y.Doc): Y.Map<Y.Map<JsonScalar>> =>
  doc.getMap("shapes");

// converts a flat shape object into the nested Y.Map form stored in the
// shapes map - nesting (rather than storing the plain object as a single
// value) is what makes per-field merging possible
export const shapeToYMap = <T extends ShapeRecord>(
  shape: T
): Y.Map<JsonScalar> => {
  const map = new Y.Map<JsonScalar>();
  for (const [key, value] of Object.entries(shape)) {
    map.set(key, value);
  }
  return map;
};

export const yMapToShape = <T extends ShapeRecord>(map: Y.Map<JsonScalar>): T =>
  Object.fromEntries(map.entries()) as T;

/** Inserts or wholesale-replaces a shape. Wrapped in its own transaction so it merges/undoes as one step. */
export const setShape = <T extends ShapeRecord>(
  doc: Y.Doc,
  id: string,
  shape: T,
  origin?: unknown
): void => {
  doc.transact(() => {
    getShapesMap(doc).set(id, shapeToYMap(shape));
  }, origin);
};

/** Merges only the given fields into an existing shape - leaves other clients' concurrent edits to other fields untouched. */
export const updateShapeFields = (
  doc: Y.Doc,
  id: string,
  updates: ShapeRecord,
  origin?: unknown
): void => {
  doc.transact(() => {
    const shapeMap = getShapesMap(doc).get(id);
    if (!shapeMap) return;
    for (const [key, value] of Object.entries(updates)) {
      shapeMap.set(key, value);
    }
  }, origin);
};

export const removeShape = (doc: Y.Doc, id: string, origin?: unknown): void => {
  doc.transact(() => {
    getShapesMap(doc).delete(id);
  }, origin);
};

/** Merges different field updates into several existing shapes as a single transaction (one undo step, one merged broadcast). */
export const updateManyShapeFields = (
  doc: Y.Doc,
  updates: Record<string, ShapeRecord>,
  origin?: unknown
): void => {
  doc.transact(() => {
    const shapesMap = getShapesMap(doc);
    for (const [id, fields] of Object.entries(updates)) {
      const shapeMap = shapesMap.get(id);
      if (!shapeMap) continue;
      for (const [key, value] of Object.entries(fields)) {
        shapeMap.set(key, value);
      }
    }
  }, origin);
};

/** Wholesale-replaces every shape, e.g. when loading a saved diagram. */
export const replaceAllShapes = <T extends ShapeRecord>(
  doc: Y.Doc,
  shapes: Record<string, T>,
  origin?: unknown
): void => {
  doc.transact(() => {
    const shapesMap = getShapesMap(doc);
    shapesMap.clear();
    for (const [id, shape] of Object.entries(shapes)) {
      shapesMap.set(id, shapeToYMap(shape));
    }
  }, origin);
};

export const getAllShapes = <T extends ShapeRecord>(
  doc: Y.Doc
): Record<string, T> => {
  const result: Record<string, T> = {};
  for (const [id, map] of getShapesMap(doc).entries()) {
    result[id] = yMapToShape<T>(map);
  }
  return result;
};
