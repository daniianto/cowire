import { useEffect, useState } from "react";
import {
  subscribeToDiagram,
  type PresenceInfo,
} from "diagram-supabase-wrapper";
import { useSupabase } from "@/supabase/hooks";
import { diagramDoc } from "@/state";

/**
 * Joins a diagram's realtime channel for as long as `diagramId` is set.
 * Shape sync itself is handled entirely by the wrapper's `subscribeToDiagram`
 * (it relays Yjs updates to/from `diagramDoc`, which canvasStore observes) -
 * this hook's only job is to open/close that connection and surface presence.
 * Returns the list of other users currently present (excluding this client).
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

    const connection = subscribeToDiagram(
      client,
      diagramId,
      diagramDoc,
      { userId: session.user.id, email: session.user.email ?? "" },
      {
        onPresenceChange: (users) =>
          setPresentUsers(users.filter((u) => u.userId !== session.user.id)),
      }
    );

    return () => connection.disconnect();
  }, [client, session, diagramId]);

  return presentUsers;
};
