import { useEffect, useState } from "react";
import {
  subscribeToDiagram,
  type ConnectionStatus,
} from "diagram-supabase-wrapper";
import {
  colorForUserId,
  createLocalAwareness,
  getPeerStates,
  setLocalUser,
  type PeerAwarenessState,
} from "diagram-crdt-core";
import { toast } from "sonner";
import { useSupabase } from "@/supabase/hooks";
import { diagramDoc, setActiveAwareness } from "@/state";

/**
 * Joins a diagram's realtime channel for as long as `diagramId` is set.
 * Shape sync is handled entirely by the wrapper's `subscribeToDiagram` (it
 * relays Yjs updates to/from `diagramDoc`, which canvasStore observes).
 * This hook additionally owns the Awareness instance for presence/live
 * cursors: it publishes this client's user info (setLocalCursor itself is
 * called from useCanvasInteraction, via state/awareness.ts's shared
 * reference, since that's where pointer position is already tracked) and
 * surfaces every other client's current awareness state. Returns that peer
 * list, refreshed on every awareness change.
 */
export const useDiagramRealtime = (
  diagramId: string | null
): PeerAwarenessState[] => {
  const { client, session } = useSupabase();
  const [peers, setPeers] = useState<PeerAwarenessState[]>([]);

  useEffect(() => {
    if (!diagramId || !session) {
      setPeers([]);
      return;
    }

    const awareness = createLocalAwareness(diagramDoc);
    setLocalUser(
      awareness,
      session.user.id,
      session.user.email ?? "",
      colorForUserId(session.user.id)
    );
    setActiveAwareness(awareness);

    const onAwarenessChange = () => setPeers(getPeerStates(awareness));
    awareness.on("change", onAwarenessChange);

    let hasConnectedBefore = false;
    const onStatusChange = (status: ConnectionStatus) => {
      if (status === "connected") {
        if (hasConnectedBefore) toast.success("Back online");
        hasConnectedBefore = true;
      } else {
        toast.error("Connection lost - reconnecting…");
      }
    };

    const connection = subscribeToDiagram(
      client,
      diagramId,
      diagramDoc,
      awareness,
      {
        onStatusChange,
      }
    );

    return () => {
      awareness.off("change", onAwarenessChange);
      setActiveAwareness(null);
      awareness.destroy();
      connection.disconnect();
    };
  }, [client, session, diagramId]);

  return peers;
};
