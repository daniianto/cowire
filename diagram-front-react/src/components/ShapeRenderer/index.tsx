import { getBoundingBox, type Shape } from "@/lib/geometry";

// canvas drawing runs inside a requestAnimationFrame loop rather than React's
// render cycle, so this "component" exports an imperative draw function
// instead of returning JSX
export const renderShape = (
  ctx: CanvasRenderingContext2D,
  shape: Shape
): void => {
  const box = getBoundingBox(shape);
  ctx.fillStyle = shape.color;
  ctx.fillRect(box.x, box.y, box.width, box.height);
};
