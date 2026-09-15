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
    R/C/A/L: rectangle/circle/arrow/label · drag: create / move / pan · shift+
    click: multi-select · shift+drag: marquee select · G / shift+G: group /
    ungroup · wheel: zoom · Delete: remove · Esc: select tool
  </div>
);
