import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCanvasStore } from "@/state";

// shown only for a single selection (see STAGE_8.md) - editing a shared
// property across a multi-selection isn't scoped here
export const Inspector = () => {
  const shape = useCanvasStore((s) =>
    s.selectedIds.length === 1 ? s.shapes[s.selectedIds[0]] : null
  );
  const updateShape = useCanvasStore((s) => s.updateShape);
  const stopCapturing = useCanvasStore((s) => s.stopCapturing);

  if (!shape) return null;

  // LabelShape's text is already editable via its own creation prompt -
  // this is for the *property* on the other three shape types
  const showLabelField = shape.type !== "label";

  return (
    // pointer-events-none on the wrapper (with pointer-events-auto on just
    // the actual controls) so this floating panel doesn't block canvas
    // drags that happen to start over its padding/background - e.g.
    // drawing a new shape near wherever the panel is currently positioned
    <div
      className="pointer-events-none flex flex-col gap-2 rounded-lg border bg-background p-2 shadow-sm"
      style={{ position: "absolute", top: 48, right: 8 }}
    >
      <div className="flex items-center gap-2">
        <Label htmlFor="shape-color" className="pointer-events-none text-xs">
          Color
        </Label>
        <input
          id="shape-color"
          type="color"
          value={shape.color}
          onFocus={() => stopCapturing()}
          onChange={(e) => updateShape(shape.id, { color: e.target.value })}
          className="pointer-events-auto h-7 w-10 cursor-pointer rounded border"
        />
      </div>
      {showLabelField && (
        <div className="flex items-center gap-2">
          <Label htmlFor="shape-label" className="pointer-events-none text-xs">
            Label
          </Label>
          <Input
            id="shape-label"
            value={shape.label ?? ""}
            onFocus={() => stopCapturing()}
            onChange={(e) => updateShape(shape.id, { label: e.target.value })}
            className="pointer-events-auto h-7 w-32"
          />
        </div>
      )}
    </div>
  );
};
