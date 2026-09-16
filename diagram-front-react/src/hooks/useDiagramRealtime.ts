import { useEffect, useState } from "react";
import {
  subscribeToDiagram,
  broadcastShapeChange,
  unsubscribeFromDiagram,
  type PresenceInfo,
} from "diagram-supabase-wrapper";
import { useSupabase } from "@/supabase/hooks";
import { useCanvasStore } from "@/state";
import { diffShapesForSync } from "@/lib/diagramSync";
import type { Shape } from "@/lib/geometry";

// never send one broadcast per pointer-move; batch changes within this
// window into a single message (see CLAUDE.md Performance section)
const BROADCAST_THROTTLE_MS = 100;

/**
 * Joins a diagram's realtime channel for as long as `diagramId` is set:
 * applies incoming shape broadcasts to the local store and broadcasts local
 * shape changes (throttled) to everyone else on the channel. Returns the
 * list of other users currently present (excluding this client).
 */
export const useDiagramRealtime = (
  diagramId: string | null
): PresenceInfo[] => {
  const { client, session } = useSupabase();
  const [presentUsers, setPresentUsers] = useState<PresenceInfo[]>([]);

  useEffect(() => {
    if (!diagramId || !session) {
      setPresentUsers([]);
      return;
    }

    // guards against re-broadcasting a change that just arrived over the
    // channel - without this, applying a remote shape would trigger the
    // store subscription below and echo it straight back to the sender
    let applyingRemote = false;
    let lastSyncedShapes = useCanvasStore.getState().shapes;
    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastSentAt = 0;

    const channel = subscribeToDiagram(
      client,
      diagramId,
      { userId: session.user.id, email: session.user.email ?? "" },
      {
        onShapeChange: (message) => {
          applyingRemote = true;
          if (message.type === "shape-upsert") {
            useCanvasStore.getState().applyRemoteShape(message.shape as Shape);
          } else {
            useCanvasStore.getState().applyRemoteRemoval(message.id);
          }
          lastSyncedShapes = useCanvasStore.getState().shapes;
          applyingRemote = false;
        },
        onPresenceChange: (users) =>
          setPresentUsers(users.filter((u) => u.userId !== session.user.id)),
      }
    );

    const flush = () => {
      const currentShapes = useCanvasStore.getState().shapes;
      const messages = diffShapesForSync(lastSyncedShapes, currentShapes);
      lastSyncedShapes = currentShapes;
      lastSentAt = Date.now();
      for (const message of messages) broadcastShapeChange(channel, message);
    };

    const unsubscribeStore = useCanvasStore.subscribe((state) => {
      if (applyingRemote || state.shapes === lastSyncedShapes) return;

      const elapsed = Date.now() - lastSentAt;
      if (elapsed >= BROADCAST_THROTTLE_MS) {
        flush();
      } else if (!pendingTimeout) {
        pendingTimeout = setTimeout(() => {
          pendingTimeout = null;
          flush();
        }, BROADCAST_THROTTLE_MS - elapsed);
      }
    });

    return () => {
      unsubscribeStore();
      if (pendingTimeout) clearTimeout(pendingTimeout);
      unsubscribeFromDiagram(channel);
    };
  }, [client, session, diagramId]);

  return presentUsers;
};
