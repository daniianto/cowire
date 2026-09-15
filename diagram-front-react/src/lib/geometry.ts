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

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BaseShape = {
  id: string;
  // draw order — higher draws on top; reassigned by bring-to-front/send-to-back
  zIndex: number;
  // shared id linking shapes that were grouped together, or null if ungrouped
  groupId: string | null;
  color: string;
};

export type RectangleShape = BaseShape & {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CircleShape = BaseShape & {
  type: "circle";
  x: number; // center
  y: number; // center
  radius: number;
};

export type ArrowShape = BaseShape & {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type LabelShape = BaseShape & {
  type: "label";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
};

export type Shape = RectangleShape | CircleShape | ArrowShape | LabelShape;

// plain Omit<Shape, K> collapses the union — keyof a union is only the keys
// common to every member, so it would erase each variant's own fields (x,
// radius, x1...). Distributing over the union first (via the `T extends
// unknown` trick) preserves them.
type DistributiveOmit<T, K extends keyof never> = T extends unknown
  ? Omit<T, K>
  : never;

/** A shape before the store assigns its zIndex/groupId (see canvasStore.addShape). */
export type NewShape = DistributiveOmit<Shape, "zIndex" | "groupId">;

const normalizeBox = (
  x: number,
  y: number,
  width: number,
  height: number
): BoundingBox => ({
  x: width < 0 ? x + width : x,
  y: height < 0 ? y + height : y,
  width: Math.abs(width),
  height: Math.abs(height),
});

/**
 * Normalizes a shape's geometry into a bounding box with non-negative
 * width/height. Needed because dragging to create/resize a shape can leave
 * it with negative deltas (e.g. dragging up-and-left, or an arrow endpoint
 * left of its start).
 */
export const getBoundingBox = (shape: Shape): BoundingBox => {
  switch (shape.type) {
    case "rectangle":
    case "label":
      return normalizeBox(shape.x, shape.y, shape.width, shape.height);
    case "circle":
      return normalizeBox(
        shape.x - shape.radius,
        shape.y - shape.radius,
        shape.radius * 2,
        shape.radius * 2
      );
    case "arrow":
      return normalizeBox(
        shape.x1,
        shape.y1,
        shape.x2 - shape.x1,
        shape.y2 - shape.y1
      );
  }
};

/** Whether two bounding boxes overlap at all (used for marquee/rubber-band selection). */
export const doBoxesIntersect = (a: BoundingBox, b: BoundingBox): boolean =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

/** Bounding box of a group of shapes — the union of their individual boxes. */
export const getGroupBoundingBox = (shapes: Shape[]): BoundingBox => {
  if (shapes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const boxes = shapes.map(getBoundingBox);
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const isPointInBox = (point: Point, box: BoundingBox): boolean =>
  point.x >= box.x &&
  point.x <= box.x + box.width &&
  point.y >= box.y &&
  point.y <= box.y + box.height;

const distance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Shortest distance from a point to the line segment a–b. */
const distanceToSegment = (point: Point, a: Point, b: Point): number => {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSquared = abx * abx + aby * aby;
  if (lengthSquared === 0) return distance(point, a);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSquared)
  );
  return distance(point, { x: a.x + t * abx, y: a.y + t * aby });
};

// how close (in canvas units) a click needs to be to an arrow's line to count as a hit
const ARROW_HIT_THRESHOLD = 6;

/**
 * Hit-tests a point (in canvas space) against a shape. Rectangles and labels
 * use their bounding box; circles use true distance-from-center (a bounding
 * box would wrongly include its corners); arrows use distance-to-line, since
 * a thin diagonal line's bounding box is mostly empty space.
 */
export const isPointInShape = (point: Point, shape: Shape): boolean => {
  switch (shape.type) {
    case "rectangle":
    case "label":
      return isPointInBox(point, getBoundingBox(shape));
    case "circle":
      return distance(point, { x: shape.x, y: shape.y }) <= shape.radius;
    case "arrow":
      return (
        distanceToSegment(
          point,
          { x: shape.x1, y: shape.y1 },
          { x: shape.x2, y: shape.y2 }
        ) <= ARROW_HIT_THRESHOLD
      );
  }
};

// size (in canvas units) of a drag handle (resize corner, arrow endpoint)
export const HANDLE_SIZE = 10;

/**
 * Bounding box of the resize handle at a shape's bottom-right corner.
 * Meaningful for rectangle/circle/label, which resize from one corner;
 * arrows resize from either endpoint instead — see getArrowHandleBounds.
 */
export const getResizeHandleBounds = (shape: Shape): BoundingBox => {
  const box = getBoundingBox(shape);
  const half = HANDLE_SIZE / 2;
  return {
    x: box.x + box.width - half,
    y: box.y + box.height - half,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  };
};

/** Hit-tests a point against a shape's (corner) resize handle. */
export const isPointInResizeHandle = (point: Point, shape: Shape): boolean =>
  isPointInBox(point, getResizeHandleBounds(shape));

/** Bounding box of the drag handle at one end of an arrow. */
export const getArrowHandleBounds = (
  shape: ArrowShape,
  endpoint: "start" | "end"
): BoundingBox => {
  const point =
    endpoint === "start"
      ? { x: shape.x1, y: shape.y1 }
      : { x: shape.x2, y: shape.y2 };
  const half = HANDLE_SIZE / 2;
  return {
    x: point.x - half,
    y: point.y - half,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  };
};

/** Hit-tests a point against one of an arrow's two endpoint handles. */
export const isPointInArrowHandle = (
  point: Point,
  shape: ArrowShape,
  endpoint: "start" | "end"
): boolean => isPointInBox(point, getArrowHandleBounds(shape, endpoint));

/**
 * Shifts a shape's geometry by a delta, regardless of its type. Used for
 * moving shapes (including every member of a group by the same delta)
 * without needing to know each type's specific fields at the call site.
 */
export const translateShape = (shape: Shape, dx: number, dy: number): Shape => {
  switch (shape.type) {
    case "rectangle":
    case "circle":
    case "label":
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case "arrow":
      return {
        ...shape,
        x1: shape.x1 + dx,
        y1: shape.y1 + dy,
        x2: shape.x2 + dx,
        y2: shape.y2 + dy,
      };
  }
};

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
