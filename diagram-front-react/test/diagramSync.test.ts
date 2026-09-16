import { describe, it, expect } from "vitest";
import { diffShapesForSync } from "../src/lib/diagramSync";
import type { RectangleShape } from "../src/lib/geometry";

const rect = (overrides: Partial<RectangleShape> = {}): RectangleShape => ({
  id: "r1",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  zIndex: 0,
  groupId: null,
  color: "#000",
  ...overrides,
});

describe("diffShapesForSync", () => {
  it("produces an upsert for a new shape", () => {
    const shape = rect();
    const messages = diffShapesForSync({}, { r1: shape });
    expect(messages).toEqual([{ type: "shape-upsert", shape }]);
  });

  it("produces an upsert with the new data for a changed shape", () => {
    const oldShape = rect();
    const newShape = rect({ x: 50 });
    const messages = diffShapesForSync({ r1: oldShape }, { r1: newShape });
    expect(messages).toEqual([{ type: "shape-upsert", shape: newShape }]);
  });

  it("produces a remove message for a removed shape", () => {
    const shape = rect();
    const messages = diffShapesForSync({ r1: shape }, {});
    expect(messages).toEqual([{ type: "shape-remove", id: "r1" }]);
  });

  it("produces nothing for an unchanged shape", () => {
    const shape = rect();
    const messages = diffShapesForSync({ r1: shape }, { r1: shape });
    expect(messages).toEqual([]);
  });
});
