import { canvasToScreen, getBoundingBox } from "@/lib/geometry";
import { useCanvasStore } from "@/state";

// replaces the old always-on keyboard-shortcut overlay: contextual, only
// shown while hovering a shape (not mid-gesture - see useCanvasInteraction),
// positioned just above its bounding box regardless of shape type
export const ShapeHoverHint = () => {
  const shape = useCanvasStore((s) =>
    s.hoveredShapeId ? s.shapes[s.hoveredShapeId] : null
  );
  const viewport = useCanvasStore((s) => s.viewport);

  if (!shape) return null;

  const box = getBoundingBox(shape);
  const screenPoint = canvasToScreen({ x: box.x, y: box.y }, viewport);

  return (
    <div
      style={{
        position: "absolute",
        left: screenPoint.x,
        top: screenPoint.y - 24,
        font: "12px system-ui, sans-serif",
        color: "#64748b",
        background: "rgba(255, 255, 255, 0.9)",
        padding: "2px 6px",
        borderRadius: 4,
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      Drag to move · Shift+click to multi-select · G to group · Delete to remove
    </div>
  );
};
