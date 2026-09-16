import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Json } from "supabase/database.types";
import type { DiagramSupabaseClient } from "./client.js";

const BROADCAST_EVENT = "shape-change";

export type ShapeChangeMessage =
  { type: "shape-upsert"; shape: Json } | { type: "shape-remove"; id: string };

export type PresenceInfo = {
  userId: string;
  email: string;
};

export type DiagramRealtimeHandlers = {
  onShapeChange: (message: ShapeChangeMessage) => void;
  onPresenceChange: (users: PresenceInfo[]) => void;
};

/**
 * Joins the per-diagram realtime channel: applies incoming broadcast shape
 * changes via `handlers.onShapeChange`, tracks this client's presence, and
 * reports the full presence list via `handlers.onPresenceChange` on every
 * join/leave. Callers should keep the returned channel and pass it to
 * `broadcastShapeChange`/`unsubscribeFromDiagram`.
 */
export const subscribeToDiagram = (
  client: DiagramSupabaseClient,
  diagramId: string,
  presence: PresenceInfo,
  handlers: DiagramRealtimeHandlers
): RealtimeChannel => {
  const channel = client.channel(`diagram:${diagramId}`, {
    config: { presence: { key: presence.userId } },
  });

  channel
    .on("broadcast", { event: BROADCAST_EVENT }, ({ payload }) => {
      handlers.onShapeChange(payload as ShapeChangeMessage);
    })
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresenceInfo>();
      handlers.onPresenceChange(Object.values(state).flat());
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void channel.track(presence);
    });

  return channel;
};

export const broadcastShapeChange = (
  channel: RealtimeChannel,
  message: ShapeChangeMessage
): void => {
  void channel.send({
    type: "broadcast",
    event: BROADCAST_EVENT,
    payload: message,
  });
};

export const unsubscribeFromDiagram = (channel: RealtimeChannel): void => {
  void channel.unsubscribe();
};
