import { useEffect, useRef } from "react";
import { renderShape } from "@/components/ShapeRenderer";
import { renderSelectionBox } from "@/components/SelectionBox";
import { useCanvasInteraction } from "@/hooks/useCanvasInteraction";
import { useCanvasStore } from "@/state";

export const Canvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasInteraction(canvasRef);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // keep the canvas's pixel buffer in sync with its displayed size,
    // accounting for device pixel ratio so rendering stays crisp
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    // read store state directly via getState() instead of subscribing —
    // the loop already redraws every frame, so a React re-render per
    // state change would be redundant work
    let frameId: number;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const { shapes, selectedId, viewport } = useCanvasStore.getState();

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);
      ctx.translate(viewport.offsetX, viewport.offsetY);
      ctx.scale(viewport.zoom, viewport.zoom);

      for (const shape of Object.values(shapes)) {
        renderShape(ctx, shape);
      }
      const selected = selectedId ? shapes[selectedId] : undefined;
      if (selected) renderSelectionBox(ctx, selected);

      ctx.restore();
      frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
};
