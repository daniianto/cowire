// no toolbar exists yet (out of scope until shadcn/ui lands) — this plain-text
// hint is the only affordance telling a person the canvas is interactive
export const KeyboardHint = () => (
  <div
    style={{
      position: "absolute",
      top: 8,
      left: 8,
      font: "12px system-ui, sans-serif",
      color: "#64748b",
      pointerEvents: "none",
    }}
  >
    R: rectangle · C: circle · A: arrow · L: label · drag: create / move / pan ·
    wheel: zoom · Delete: remove · Esc: select tool
  </div>
);
