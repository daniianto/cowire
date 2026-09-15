import {
  getArrowHandleBounds,
  getBoundingBox,
  getResizeHandleBounds,
  type Shape,
} from "@/lib/geometry";

// same rationale as ShapeRenderer: an imperative draw function, not JSX
const SELECTION_COLOR = "#3b82f6";

const drawHandle = (
  ctx: CanvasRenderingContext2D,
  box: ReturnType<typeof getResizeHandleBounds>
): void => {
  ctx.fillStyle = SELECTION_COLOR;
  ctx.fillRect(box.x, box.y, box.width, box.height);
};

export const renderSelectionBox = (
  ctx: CanvasRenderingContext2D,
  shape: Shape
): void => {
  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  if (shape.type === "circle") {
    ctx.beginPath();
    ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const box = getBoundingBox(shape);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  }
  ctx.restore();

  // arrows resize from either endpoint; everything else resizes from one
  // bottom-right corner handle
  if (shape.type === "arrow") {
    drawHandle(ctx, getArrowHandleBounds(shape, "start"));
    drawHandle(ctx, getArrowHandleBounds(shape, "end"));
  } else {
    drawHandle(ctx, getResizeHandleBounds(shape));
  }
};
