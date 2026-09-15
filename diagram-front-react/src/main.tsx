import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@/components/Canvas";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Canvas />
  </StrictMode>
);
