export type Point = {
  x: number;
  y: number;
};

// pan/zoom state of the canvas: offset is applied before scaling by zoom
export type Viewport = {
  offsetX: number;
  offsetY: number;
  zoom: number;
};

export type Shape = {
  id: string;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Normalizes a shape's geometry into a bounding box with non-negative
 * width/height. Needed because dragging to create/resize a shape can leave
 * it with a negative width or height (e.g. dragging up-and-left).
 */
export const getBoundingBox = (shape: Shape): BoundingBox => {
  const x = shape.width < 0 ? shape.x + shape.width : shape.x;
  const y = shape.height < 0 ? shape.y + shape.height : shape.y;
  return { x, y, width: Math.abs(shape.width), height: Math.abs(shape.height) };
};

const isPointInBox = (point: Point, box: BoundingBox): boolean =>
  point.x >= box.x &&
  point.x <= box.x + box.width &&
  point.y >= box.y &&
  point.y <= box.y + box.height;

/** Hit-tests a point (in canvas space) against a shape's bounding box. */
export const isPointInShape = (point: Point, shape: Shape): boolean =>
  isPointInBox(point, getBoundingBox(shape));

// size (in canvas units) of the resize handle drawn at a shape's bottom-right corner
export const RESIZE_HANDLE_SIZE = 10;

/** Bounding box of the resize handle at a shape's bottom-right corner. */
export const getResizeHandleBounds = (shape: Shape): BoundingBox => {
  const box = getBoundingBox(shape);
  const half = RESIZE_HANDLE_SIZE / 2;
  return {
    x: box.x + box.width - half,
    y: box.y + box.height - half,
    width: RESIZE_HANDLE_SIZE,
    height: RESIZE_HANDLE_SIZE,
  };
};

/** Hit-tests a point against a shape's resize handle. */
export const isPointInResizeHandle = (point: Point, shape: Shape): boolean =>
  isPointInBox(point, getResizeHandleBounds(shape));

/** Converts a point in screen space (e.g. pointer event coords) to canvas space. */
export const screenToCanvas = (point: Point, viewport: Viewport): Point => ({
  x: (point.x - viewport.offsetX) / viewport.zoom,
  y: (point.y - viewport.offsetY) / viewport.zoom,
});

/** Converts a point in canvas space to screen space — the inverse of screenToCanvas. */
export const canvasToScreen = (point: Point, viewport: Viewport): Point => ({
  x: point.x * viewport.zoom + viewport.offsetX,
  y: point.y * viewport.zoom + viewport.offsetY,
});
