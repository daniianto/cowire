import {
  getBoundingBox,
  getConnectorHandleBounds,
  getGroupBoundingBox,
  getResizeHandleBounds,
  type BoundingBox,
  type Shape,
} from "@/lib/geometry";

// same rationale as ShapeRenderer: an imperative draw function, not JSX
const SELECTION_COLOR = "#3b82f6";
const MARQUEE_FILL = "rgba(59, 130, 246, 0.1)";

const drawHandle = (ctx: CanvasRenderingContext2D, box: BoundingBox): void => {
  ctx.fillStyle = SELECTION_COLOR;
  ctx.fillRect(box.x, box.y, box.width, box.height);
};

const strokeDashedBox = (
  ctx: CanvasRenderingContext2D,
  box: BoundingBox
): void => {
  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();
};

/** Selection outline + resize handle(s) for a single selected shape. */
export const renderSelectionBox = (
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  allShapes: Record<string, Shape>
): void => {
  if (shape.type === "circle" || shape.type === "ellipse") {
    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    if (shape.type === "circle") {
      ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
    } else {
      ctx.ellipse(
        shape.x,
        shape.y,
        Math.abs(shape.radiusX),
        Math.abs(shape.radiusY),
        0,
        0,
        Math.PI * 2
      );
    }
    ctx.stroke();
    ctx.restore();
  } else {
    // triangle/diamond use their bounding box as an outline approximation,
    // same as their resize handle already does
    strokeDashedBox(ctx, getBoundingBox(shape, allShapes));
  }

  // connectors (arrow/line) resize from either endpoint; everything else
  // resizes from one bottom-right corner handle
  if (shape.type === "arrow" || shape.type === "line") {
    drawHandle(ctx, getConnectorHandleBounds(shape, "start", allShapes));
    drawHandle(ctx, getConnectorHandleBounds(shape, "end", allShapes));
  } else {
    drawHandle(ctx, getResizeHandleBounds(shape));
  }
};

/**
 * Selection outline for multiple selected shapes — one box around the union
 * of their bounds, no resize handles (resizing a multi-selection is out of
 * scope for now; only moving and grouping act on it).
 */
export const renderGroupSelectionBox = (
  ctx: CanvasRenderingContext2D,
  shapes: Shape[]
): void => {
  strokeDashedBox(ctx, getGroupBoundingBox(shapes));
};

/** The in-progress rubber-band rectangle while marquee-selecting. */
export const renderMarquee = (
  ctx: CanvasRenderingContext2D,
  rect: BoundingBox
): void => {
  ctx.save();
  ctx.fillStyle = MARQUEE_FILL;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
  strokeDashedBox(ctx, rect);
};
