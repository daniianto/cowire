import { describe, it, expect } from "vitest";
import {
  getBoundingBox,
  getGroupBoundingBox,
  doBoxesIntersect,
  isPointInShape,
  isPointInResizeHandle,
  isPointInArrowHandle,
  screenToCanvas,
  canvasToScreen,
  getContrastTextColor,
  resolveArrowEndpoints,
  type RectangleShape,
  type CircleShape,
  type ArrowShape,
  type LabelShape,
  type Shape,
} from "../src/lib/geometry";

const rect = (overrides: Partial<RectangleShape> = {}): RectangleShape => ({
  id: "1",
  type: "rectangle",
  zIndex: 0,
  groupId: null,
  x: 10,
  y: 10,
  width: 20,
  height: 20,
  color: "#000000",
  ...overrides,
});

const circle = (overrides: Partial<CircleShape> = {}): CircleShape => ({
  id: "2",
  type: "circle",
  zIndex: 0,
  groupId: null,
  x: 50,
  y: 50,
  radius: 10,
  color: "#000000",
  ...overrides,
});

const arrow = (overrides: Partial<ArrowShape> = {}): ArrowShape => ({
  id: "3",
  type: "arrow",
  zIndex: 0,
  groupId: null,
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 0,
  color: "#000000",
  startAttachedToId: null,
  endAttachedToId: null,
  ...overrides,
});

const label = (overrides: Partial<LabelShape> = {}): LabelShape => ({
  id: "4",
  type: "label",
  zIndex: 0,
  groupId: null,
  x: 10,
  y: 10,
  width: 40,
  height: 16,
  text: "hello",
  fontSize: 14,
  color: "#000000",
  ...overrides,
});

describe("getBoundingBox", () => {
  it("returns a rectangle's own geometry when width/height are positive", () => {
    expect(getBoundingBox(rect())).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    });
  });

  it("normalizes a rectangle with negative width/height", () => {
    expect(
      getBoundingBox(rect({ x: 30, y: 30, width: -20, height: -20 }))
    ).toEqual({ x: 10, y: 10, width: 20, height: 20 });
  });

  it("computes a circle's bounding box from its center and radius", () => {
    expect(getBoundingBox(circle({ x: 50, y: 50, radius: 10 }))).toEqual({
      x: 40,
      y: 40,
      width: 20,
      height: 20,
    });
  });

  it("normalizes an arrow's endpoints into a bounding box regardless of direction", () => {
    expect(getBoundingBox(arrow({ x1: 100, y1: 50, x2: 0, y2: 0 }))).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });
  });

  it("treats a label like a rectangle", () => {
    expect(getBoundingBox(label())).toEqual({
      x: 10,
      y: 10,
      width: 40,
      height: 16,
    });
  });
});

describe("getGroupBoundingBox", () => {
  it("returns the union box of multiple shapes", () => {
    const a = rect({ x: 0, y: 0, width: 10, height: 10 });
    const b = rect({ id: "5", x: 40, y: 40, width: 10, height: 10 });
    expect(getGroupBoundingBox([a, b])).toEqual({
      x: 0,
      y: 0,
      width: 50,
      height: 50,
    });
  });

  it("returns a single shape's own box when given one shape", () => {
    expect(getGroupBoundingBox([rect()])).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    });
  });

  it("returns a zero box for an empty group", () => {
    expect(getGroupBoundingBox([])).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});

describe("doBoxesIntersect", () => {
  const box = { x: 10, y: 10, width: 20, height: 20 }; // (10,10)-(30,30)

  it("returns true for overlapping boxes", () => {
    expect(doBoxesIntersect(box, { x: 20, y: 20, width: 20, height: 20 })).toBe(
      true
    );
  });

  it("returns true when one box fully contains the other", () => {
    expect(doBoxesIntersect(box, { x: 15, y: 15, width: 5, height: 5 })).toBe(
      true
    );
  });

  it("returns false for boxes that don't touch", () => {
    expect(
      doBoxesIntersect(box, { x: 100, y: 100, width: 10, height: 10 })
    ).toBe(false);
  });

  it("returns false for boxes that only touch at an edge", () => {
    // b starts exactly where box ends — no actual overlap area
    expect(doBoxesIntersect(box, { x: 30, y: 10, width: 10, height: 10 })).toBe(
      false
    );
  });
});

describe("isPointInShape", () => {
  it("hit-tests a rectangle via its bounding box", () => {
    expect(isPointInShape({ x: 15, y: 15 }, rect())).toBe(true);
    expect(isPointInShape({ x: 5, y: 5 }, rect())).toBe(false);
  });

  it("hit-tests a circle by distance from center, not its bounding square", () => {
    const c = circle({ x: 50, y: 50, radius: 10 });
    expect(isPointInShape({ x: 50, y: 50 }, c)).toBe(true); // center
    expect(isPointInShape({ x: 50, y: 59 }, c)).toBe(true); // inside radius
    // corner of the bounding square is outside the actual circle
    expect(isPointInShape({ x: 41, y: 41 }, c)).toBe(false);
  });

  it("hit-tests an arrow by proximity to its line, not its bounding box", () => {
    const a = arrow({ x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(isPointInShape({ x: 50, y: 0 }, a)).toBe(true); // on the line
    expect(isPointInShape({ x: 50, y: 3 }, a)).toBe(true); // within threshold
    // inside the arrow's bounding box, but far from the actual line — arrows
    // are thin, so a bounding-box hit test would wrongly count this
    expect(isPointInShape({ x: 50, y: 50 }, a)).toBe(false);
  });
});

describe("isPointInResizeHandle", () => {
  it("returns true for a point on the bottom-right handle", () => {
    // rect() spans (10,10) to (30,30), so its handle is centered on (30,30)
    expect(isPointInResizeHandle({ x: 30, y: 30 }, rect())).toBe(true);
  });

  it("returns false for a point away from the handle", () => {
    expect(isPointInResizeHandle({ x: 15, y: 15 }, rect())).toBe(false);
  });
});

describe("isPointInArrowHandle", () => {
  const a = arrow({ x1: 0, y1: 0, x2: 100, y2: 0 });

  it("hit-tests the start endpoint handle", () => {
    expect(isPointInArrowHandle({ x: 0, y: 0 }, a, "start")).toBe(true);
    expect(isPointInArrowHandle({ x: 100, y: 0 }, a, "start")).toBe(false);
  });

  it("hit-tests the end endpoint handle", () => {
    expect(isPointInArrowHandle({ x: 100, y: 0 }, a, "end")).toBe(true);
    expect(isPointInArrowHandle({ x: 0, y: 0 }, a, "end")).toBe(false);
  });
});

describe("screenToCanvas / canvasToScreen", () => {
  it("round-trips a point through both transforms", () => {
    const viewport = { offsetX: 50, offsetY: -20, zoom: 2 };
    const original = { x: 123, y: 45 };
    const roundTripped = canvasToScreen(
      screenToCanvas(original, viewport),
      viewport
    );
    expect(roundTripped.x).toBeCloseTo(original.x);
    expect(roundTripped.y).toBeCloseTo(original.y);
  });

  it("applies offset and zoom when converting screen to canvas space", () => {
    const viewport = { offsetX: 100, offsetY: 100, zoom: 2 };
    expect(screenToCanvas({ x: 200, y: 300 }, viewport)).toEqual({
      x: 50,
      y: 100,
    });
  });

  it("applies offset and zoom when converting canvas to screen space", () => {
    const viewport = { offsetX: 100, offsetY: 100, zoom: 2 };
    expect(canvasToScreen({ x: 50, y: 100 }, viewport)).toEqual({
      x: 200,
      y: 300,
    });
  });
});

describe("getContrastTextColor", () => {
  it("picks black text on a light background", () => {
    expect(getContrastTextColor("#ffffff")).toBe("#000000");
  });

  it("picks white text on a dark background", () => {
    expect(getContrastTextColor("#000000")).toBe("#ffffff");
  });
});

describe("resolveArrowEndpoints", () => {
  it("returns an unattached arrow's raw coordinates unchanged", () => {
    const shape = arrow({ x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(resolveArrowEndpoints(shape, { [shape.id]: shape })).toEqual({
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
    });
  });

  it("resolves an endpoint attached to a rectangle onto its edge", () => {
    const target = rect({ id: "target", x: 200, y: 90, width: 20, height: 20 });
    const shape = arrow({
      x1: 0,
      y1: 100,
      x2: 999, // stale/irrelevant - target attachment overrides it
      y2: 999,
      endAttachedToId: "target",
    });
    const shapes: Record<string, Shape> = { [shape.id]: shape, target };
    const resolved = resolveArrowEndpoints(shape, shapes);
    // target's box is x:[200,220] y:[90,110], centered at (210,100) -
    // approaching from (0,100) (straight left) should land on its left edge
    expect(resolved.x2).toBeCloseTo(200);
    expect(resolved.y2).toBeCloseTo(100);
  });

  it("resolves an endpoint attached to a circle onto its edge", () => {
    const target = circle({ id: "target", x: 200, y: 100, radius: 10 });
    const shape = arrow({
      x1: 0,
      y1: 100,
      x2: 999,
      y2: 999,
      endAttachedToId: "target",
    });
    const shapes: Record<string, Shape> = { [shape.id]: shape, target };
    const resolved = resolveArrowEndpoints(shape, shapes);
    // approaching from directly left, the edge point is radius away on that side
    expect(resolved.x2).toBeCloseTo(190);
    expect(resolved.y2).toBeCloseTo(100);
  });

  it("falls back to the raw coordinate when the attached shape no longer exists", () => {
    const shape = arrow({
      x1: 0,
      y1: 0,
      x2: 42,
      y2: 7,
      endAttachedToId: "deleted-shape",
    });
    expect(resolveArrowEndpoints(shape, { [shape.id]: shape })).toEqual({
      x1: 0,
      y1: 0,
      x2: 42,
      y2: 7,
    });
  });
});
