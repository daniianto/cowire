import type { RealtimeChannel } from "@supabase/supabase-js";
import * as Y from "yjs";
import type { DiagramSupabaseClient } from "./client.js";

const UPDATE_EVENT = "doc-update";
const SYNC_REQUEST_EVENT = "sync-request";
const SYNC_RESPONSE_EVENT = "sync-response";

// never send one broadcast per pointer-move/keystroke (see CLAUDE.md
// Performance section) - local updates arriving within this window are
// merged into a single broadcast
const BROADCAST_THROTTLE_MS = 100;

// tags a transaction as caused by an update that arrived over the wire, so
// it's excluded from re-broadcasting and from the local client's own
// Y.UndoManager (see diagram-crdt-core/src/undo.ts)
export const REMOTE_ORIGIN = "remote";

export type PresenceInfo = {
  userId: string;
  email: string;
};

export type DiagramDocHandlers = {
  onPresenceChange: (users: PresenceInfo[]) => void;
};

export type DiagramDocConnection = {
  channel: RealtimeChannel;
  disconnect: () => void;
};

/**
 * Joins a diagram's realtime channel and keeps `doc` in sync with every
 * other client on it. Local edits (any transaction not tagged
 * REMOTE_ORIGIN) are throttled and broadcast as merged Yjs updates;
 * incoming updates are applied under REMOTE_ORIGIN. On join, this client
 * broadcasts its state vector so an already-connected peer can reply with
 * whatever full history it's missing - not just changes made from here on.
 * Presence tracking works the same way as Stage 4.
 */
export const subscribeToDiagram = (
  client: DiagramSupabaseClient,
  diagramId: string,
  doc: Y.Doc,
  presence: PresenceInfo,
  handlers: DiagramDocHandlers
): DiagramDocConnection => {
  const channel = client.channel(`diagram:${diagramId}`, {
    config: { presence: { key: presence.userId } },
  });

  let pendingUpdates: Uint8Array[] = [];
  let flushTimeout: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    flushTimeout = null;
    if (pendingUpdates.length === 0) return;
    const merged = Y.mergeUpdates(pendingUpdates);
    pendingUpdates = [];
    void channel.send({
      type: "broadcast",
      event: UPDATE_EVENT,
      payload: { update: Array.from(merged) },
    });
  };

  const onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE_ORIGIN) return;
    pendingUpdates.push(update);
    if (!flushTimeout) flushTimeout = setTimeout(flush, BROADCAST_THROTTLE_MS);
  };
  doc.on("update", onDocUpdate);

  channel
    .on(
      "broadcast",
      { event: UPDATE_EVENT },
      ({ payload }: { payload: { update: number[] } }) => {
        Y.applyUpdate(doc, Uint8Array.from(payload.update), REMOTE_ORIGIN);
      }
    )
    .on(
      "broadcast",
      { event: SYNC_REQUEST_EVENT },
      ({ payload }: { payload: { stateVector: number[] } }) => {
        const theirs = Uint8Array.from(payload.stateVector);
        const missing = Y.encodeStateAsUpdate(doc, theirs);
        void channel.send({
          type: "broadcast",
          event: SYNC_RESPONSE_EVENT,
          payload: { update: Array.from(missing) },
        });
      }
    )
    .on(
      "broadcast",
      { event: SYNC_RESPONSE_EVENT },
      ({ payload }: { payload: { update: number[] } }) => {
        Y.applyUpdate(doc, Uint8Array.from(payload.update), REMOTE_ORIGIN);
      }
    )
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresenceInfo>();
      handlers.onPresenceChange(Object.values(state).flat());
    })
    .subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      void channel.track(presence);
      void channel.send({
        type: "broadcast",
        event: SYNC_REQUEST_EVENT,
        payload: { stateVector: Array.from(Y.encodeStateVector(doc)) },
      });
    });

  return {
    channel,
    disconnect: () => {
      doc.off("update", onDocUpdate);
      if (flushTimeout) clearTimeout(flushTimeout);
      void channel.unsubscribe();
    },
  };
};
