import {
  MousePointer2,
  Square,
  Circle,
  Ellipse,
  Triangle,
  Diamond,
  ArrowRight,
  Slash,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCanvasStore, type Tool } from "@/state";

const TOOLS: {
  tool: Tool;
  label: string;
  shortcut: string;
  Icon: typeof Square;
}[] = [
  { tool: "select", label: "Select", shortcut: "Esc", Icon: MousePointer2 },
  { tool: "rectangle", label: "Rectangle", shortcut: "R", Icon: Square },
  { tool: "circle", label: "Circle", shortcut: "C", Icon: Circle },
  { tool: "ellipse", label: "Ellipse", shortcut: "E", Icon: Ellipse },
  { tool: "triangle", label: "Triangle", shortcut: "T", Icon: Triangle },
  { tool: "diamond", label: "Diamond", shortcut: "D", Icon: Diamond },
  { tool: "arrow", label: "Arrow", shortcut: "A", Icon: ArrowRight },
  { tool: "line", label: "Line", shortcut: "N", Icon: Slash },
  { tool: "label", label: "Label", shortcut: "L", Icon: Type },
];

// on-screen tool switching, needed on touch devices since there's no
// keyboard to press these shortcuts on - desktop keyboard shortcuts still
// work exactly as before, this is purely an additional way in
export const Toolbar = () => {
  const tool = useCanvasStore((s) => s.tool);
  const setTool = useCanvasStore((s) => s.setTool);

  return (
    <div className="flex flex-wrap justify-center gap-1 rounded-lg border bg-background p-1 shadow-sm">
      {TOOLS.map(({ tool: t, label, shortcut, Icon }) => (
        <Button
          key={t}
          type="button"
          size="icon"
          variant={tool === t ? "default" : "ghost"}
          aria-label={label}
          title={`${label} (${shortcut})`}
          onClick={() => setTool(t)}
        >
          <Icon />
        </Button>
      ))}
    </div>
  );
};
