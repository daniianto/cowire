import type { PeerAwarenessState } from "diagram-crdt-core";
import { canvasToScreen } from "@/lib/geometry";
import { useCanvasStore } from "@/state";

type RemoteCursorsProps = {
  peers: PeerAwarenessState[];
};

// a plain absolutely-positioned overlay, not drawn into the canvas itself -
// re-renders on viewport changes (pan/zoom) via the reactive selector below,
// and on peer cursor updates via the `peers` prop; no rAF loop needed since
// nothing here animates faster than React state changes anyway
export const RemoteCursors = ({ peers }: RemoteCursorsProps) => {
  const viewport = useCanvasStore((s) => s.viewport);

  return (
    <div
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      aria-hidden
    >
      {peers
        .filter((peer) => peer.cursor)
        .map((peer) => {
          const screenPoint = canvasToScreen(peer.cursor!, viewport);
          return (
            <div
              key={peer.userId}
              style={{
                position: "absolute",
                left: screenPoint.x,
                top: screenPoint.y,
                transform: "translate(-2px, -2px)",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: peer.color,
                }}
              />
              <span
                style={{
                  display: "block",
                  marginTop: 2,
                  fontSize: 11,
                  color: peer.color,
                  whiteSpace: "nowrap",
                }}
              >
                {peer.email}
              </span>
            </div>
          );
        })}
    </div>
  );
};
