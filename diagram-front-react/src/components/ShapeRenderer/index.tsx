import {
  getBoundingBox,
  getContrastTextColor,
  resolveArrowEndpoints,
  type Shape,
} from "@/lib/geometry";

// canvas drawing runs inside a requestAnimationFrame loop rather than React's
// render cycle, so this "component" exports an imperative draw function
// instead of returning JSX
export const renderShape = (
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  shapes: Record<string, Shape>
): void => {
  ctx.fillStyle = shape.color;

  switch (shape.type) {
    case "rectangle": {
      const box = getBoundingBox(shape);
      ctx.fillRect(box.x, box.y, box.width, box.height);
      if (shape.label) {
        drawCenteredLabel(
          ctx,
          shape.label,
          box.x + box.width / 2,
          box.y + box.height / 2,
          getContrastTextColor(shape.color)
        );
      }
      break;
    }
    case "label": {
      const box = getBoundingBox(shape);
      ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.fillStyle = "#0f172a";
      ctx.font = `${shape.fontSize}px system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(shape.text, box.x + 4, box.y + box.height / 2);
      break;
    }
    case "circle":
      ctx.beginPath();
      ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
      ctx.fill();
      if (shape.label) {
        drawCenteredLabel(
          ctx,
          shape.label,
          shape.x,
          shape.y,
          getContrastTextColor(shape.color)
        );
      }
      break;
    case "arrow": {
      // an attached endpoint tracks the target shape's current edge rather
      // than the arrow's own (possibly stale) stored coordinate
      const { x1, y1, x2, y2 } = resolveArrowEndpoints(shape, shapes);
      drawArrow(ctx, x1, y1, x2, y2, shape.color);
      if (shape.label) {
        // an arrow's label sits over whatever's on the canvas behind it
        // (unlike a rectangle/circle label, which already has the shape's
        // own fill for contrast) - a background pill keeps it readable
        // regardless, always paired with a fixed dark text color
        drawCenteredLabel(
          ctx,
          shape.label,
          (x1 + x2) / 2,
          (y1 + y2) / 2,
          "#0f172a",
          "#f8fafc"
        );
      }
      break;
    }
  }
};

const LABEL_FONT_SIZE = 13;
const LABEL_BACKGROUND_PADDING_X = 6;
const LABEL_BACKGROUND_PADDING_Y = 3;

const drawCenteredLabel = (
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  textColor: string,
  backgroundColor?: string
): void => {
  ctx.save();
  ctx.font = `${LABEL_FONT_SIZE}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (backgroundColor) {
    const { width } = ctx.measureText(text);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(
      centerX - width / 2 - LABEL_BACKGROUND_PADDING_X,
      centerY - LABEL_FONT_SIZE / 2 - LABEL_BACKGROUND_PADDING_Y,
      width + LABEL_BACKGROUND_PADDING_X * 2,
      LABEL_FONT_SIZE + LABEL_BACKGROUND_PADDING_Y * 2
    );
  }

  ctx.fillStyle = textColor;
  ctx.fillText(text, centerX, centerY);
  ctx.restore();
};

const ARROWHEAD_LENGTH = 12;
const ARROWHEAD_ANGLE = Math.PI / 7;

const drawArrow = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string
): void => {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // arrowhead: two short lines back from the end point, angled off the shaft
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - ARROWHEAD_LENGTH * Math.cos(angle - ARROWHEAD_ANGLE),
    y2 - ARROWHEAD_LENGTH * Math.sin(angle - ARROWHEAD_ANGLE)
  );
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - ARROWHEAD_LENGTH * Math.cos(angle + ARROWHEAD_ANGLE),
    y2 - ARROWHEAD_LENGTH * Math.sin(angle + ARROWHEAD_ANGLE)
  );
  ctx.stroke();
};
