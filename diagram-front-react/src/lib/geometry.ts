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
  // an optional caption rendered on the shape - distinct from LabelShape
  // below, which *is* a standalone text shape rather than a property
  label?: string;
};

export type CircleShape = BaseShape & {
  type: "circle";
  x: number; // center
  y: number; // center
  radius: number;
  label?: string;
};

export type ArrowShape = BaseShape & {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  // id of the shape this endpoint is bound to, or null if it's a free
  // point - see resolveArrowEndpoints, which is what actually keeps a
  // bound endpoint on the target shape's edge
  startAttachedToId: string | null;
  endAttachedToId: string | null;
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
 *
 * `shapes` (the full shape map) is optional and only matters for an arrow:
 * when passed, an attached endpoint is resolved to the target shape's
 * current edge instead of using the arrow's own stored (possibly stale)
 * coordinate - see resolveArrowEndpoints.
 */
export const getBoundingBox = (
  shape: Shape,
  shapes?: Record<string, Shape>
): BoundingBox => {
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
    case "arrow": {
      const { x1, y1, x2, y2 } = shapes
        ? resolveArrowEndpoints(shape, shapes)
        : shape;
      return normalizeBox(x1, y1, x2 - x1, y2 - y1);
    }
  }
};

const centerOf = (shape: Shape): Point => {
  const box = getBoundingBox(shape);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/**
 * Point on a shape's boundary closest to intersecting the line from its
 * center towards `towards` - i.e. "the edge of this shape facing that
 * direction". Used to keep an attached arrow endpoint sitting on the target
 * shape's edge rather than floating at its center or drifting inside it.
 */
export const getEdgePoint = (shape: Shape, towards: Point): Point => {
  if (shape.type === "circle") {
    const dx = towards.x - shape.x;
    const dy = towards.y - shape.y;
    const dist = Math.hypot(dx, dy) || 1;
    return {
      x: shape.x + (dx / dist) * shape.radius,
      y: shape.y + (dy / dist) * shape.radius,
    };
  }
  // rectangle/label (and arrow, though arrows are never a valid attachment
  // target): ray-box intersection from the box's center
  const box = getBoundingBox(shape);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = towards.x - cx;
  const dy = towards.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scaleX = dx !== 0 ? box.width / 2 / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? box.height / 2 / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
};

/**
 * Resolves an arrow's effective endpoints: an attached endpoint (see
 * ArrowShape.startAttachedToId/endAttachedToId) is recomputed against the
 * target shape's *current* position/size rather than trusting the arrow's
 * own stored coordinate, which is only a fallback for an unattached
 * endpoint or a dangling attachment (target since deleted - self-healing,
 * see STAGE_8.md). This is called at render/hit-test time, never written
 * back into the doc.
 */
export const resolveArrowEndpoints = (
  shape: ArrowShape,
  shapes: Record<string, Shape>
): { x1: number; y1: number; x2: number; y2: number } => {
  let { x1, y1, x2, y2 } = shape;
  const startTarget = shape.startAttachedToId
    ? shapes[shape.startAttachedToId]
    : undefined;
  const endTarget = shape.endAttachedToId
    ? shapes[shape.endAttachedToId]
    : undefined;

  const startCenter = startTarget ? centerOf(startTarget) : { x: x1, y: y1 };
  const endCenter = endTarget ? centerOf(endTarget) : { x: x2, y: y2 };

  if (startTarget) ({ x: x1, y: y1 } = getEdgePoint(startTarget, endCenter));
  if (endTarget) ({ x: x2, y: y2 } = getEdgePoint(endTarget, startCenter));

  return { x1, y1, x2, y2 };
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
  const boxes = shapes.map((s) => getBoundingBox(s));
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
export const isPointInShape = (
  point: Point,
  shape: Shape,
  shapes?: Record<string, Shape>
): boolean => {
  switch (shape.type) {
    case "rectangle":
    case "label":
      return isPointInBox(point, getBoundingBox(shape));
    case "circle":
      return distance(point, { x: shape.x, y: shape.y }) <= shape.radius;
    case "arrow": {
      const { x1, y1, x2, y2 } = shapes
        ? resolveArrowEndpoints(shape, shapes)
        : shape;
      return (
        distanceToSegment(point, { x: x1, y: y1 }, { x: x2, y: y2 }) <=
        ARROW_HIT_THRESHOLD
      );
    }
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
  endpoint: "start" | "end",
  shapes?: Record<string, Shape>
): BoundingBox => {
  const resolved = shapes ? resolveArrowEndpoints(shape, shapes) : shape;
  const point =
    endpoint === "start"
      ? { x: resolved.x1, y: resolved.y1 }
      : { x: resolved.x2, y: resolved.y2 };
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
  endpoint: "start" | "end",
  shapes?: Record<string, Shape>
): boolean =>
  isPointInBox(point, getArrowHandleBounds(shape, endpoint, shapes));

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

/**
 * Picks black or white text for readability against a `#rrggbb` background
 * color (relative luminance) — used for a shape's label, so it stays
 * legible regardless of the shape's own color.
 */
export const getContrastTextColor = (hexColor: string): string => {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? "#000000" : "#ffffff";
};
