import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@/components/Canvas";
import { KeyboardHint } from "@/components/KeyboardHint";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas />
      <KeyboardHint />
    </div>
  </StrictMode>
);
