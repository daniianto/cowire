import type { ShapeChangeMessage } from "diagram-supabase-wrapper";
import type { Shape } from "./geometry";

/**
 * Diffs two shape maps into the broadcast messages needed to bring other
 * clients up to date. Every store update replaces changed shapes with a new
 * object (see canvasStore.ts) and never mutates in place, so reference
 * equality is enough to detect a change - no deep comparison needed.
 */
export const diffShapesForSync = (
  oldShapes: Record<string, Shape>,
  newShapes: Record<string, Shape>
): ShapeChangeMessage[] => {
  const messages: ShapeChangeMessage[] = [];

  for (const [id, shape] of Object.entries(newShapes)) {
    if (oldShapes[id] !== shape) {
      messages.push({ type: "shape-upsert", shape });
    }
  }

  for (const id of Object.keys(oldShapes)) {
    if (!(id in newShapes)) {
      messages.push({ type: "shape-remove", id });
    }
  }

  return messages;
};
