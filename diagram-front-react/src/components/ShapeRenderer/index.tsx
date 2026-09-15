import { getBoundingBox, type Shape } from "@/lib/geometry";

// canvas drawing runs inside a requestAnimationFrame loop rather than React's
// render cycle, so this "component" exports an imperative draw function
// instead of returning JSX
export const renderShape = (
  ctx: CanvasRenderingContext2D,
  shape: Shape
): void => {
  ctx.fillStyle = shape.color;

  switch (shape.type) {
    case "rectangle":
    case "label": {
      const box = getBoundingBox(shape);
      ctx.fillRect(box.x, box.y, box.width, box.height);
      if (shape.type === "label") {
        ctx.fillStyle = "#0f172a";
        ctx.font = `${shape.fontSize}px system-ui, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillText(shape.text, box.x + 4, box.y + box.height / 2);
      }
      break;
    }
    case "circle":
      ctx.beginPath();
      ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "arrow":
      drawArrow(ctx, shape.x1, shape.y1, shape.x2, shape.y2, shape.color);
      break;
  }
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
