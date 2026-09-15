import {
  getBoundingBox,
  getResizeHandleBounds,
  type Shape,
} from "@/lib/geometry";

// same rationale as ShapeRenderer: an imperative draw function, not JSX
const SELECTION_COLOR = "#3b82f6";

export const renderSelectionBox = (
  ctx: CanvasRenderingContext2D,
  shape: Shape
): void => {
  const box = getBoundingBox(shape);

  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();

  const handle = getResizeHandleBounds(shape);
  ctx.fillStyle = SELECTION_COLOR;
  ctx.fillRect(handle.x, handle.y, handle.width, handle.height);
};
