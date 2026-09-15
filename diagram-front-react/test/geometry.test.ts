import { describe, it, expect } from "vitest";
import {
  getBoundingBox,
  isPointInShape,
  isPointInResizeHandle,
  screenToCanvas,
  canvasToScreen,
  type Shape,
} from "../src/lib/geometry";

const rect = (overrides: Partial<Shape> = {}): Shape => ({
  id: "1",
  type: "rectangle",
  x: 10,
  y: 10,
  width: 20,
  height: 20,
  color: "#000000",
  ...overrides,
});

describe("getBoundingBox", () => {
  it("returns the shape's own geometry when width/height are positive", () => {
    expect(getBoundingBox(rect())).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    });
  });

  it("normalizes negative width", () => {
    expect(getBoundingBox(rect({ x: 30, width: -20 }))).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    });
  });

  it("normalizes negative height", () => {
    expect(getBoundingBox(rect({ y: 30, height: -20 }))).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    });
  });

  it("normalizes both negative width and height", () => {
    expect(
      getBoundingBox(rect({ x: 30, y: 30, width: -20, height: -20 }))
    ).toEqual({ x: 10, y: 10, width: 20, height: 20 });
  });
});

describe("isPointInShape", () => {
  it("returns true for a point inside the shape", () => {
    expect(isPointInShape({ x: 15, y: 15 }, rect())).toBe(true);
  });

  it("returns true for a point exactly on the boundary", () => {
    expect(isPointInShape({ x: 10, y: 10 }, rect())).toBe(true);
    expect(isPointInShape({ x: 30, y: 30 }, rect())).toBe(true);
  });

  it("returns false for a point outside the shape", () => {
    expect(isPointInShape({ x: 5, y: 5 }, rect())).toBe(false);
    expect(isPointInShape({ x: 31, y: 15 }, rect())).toBe(false);
  });

  it("hit-tests correctly against a shape with negative width/height", () => {
    const negative = rect({ x: 30, y: 30, width: -20, height: -20 });
    expect(isPointInShape({ x: 15, y: 15 }, negative)).toBe(true);
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
