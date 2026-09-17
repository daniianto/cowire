import type { RealtimeChannel } from "@supabase/supabase-js";
import * as Y from "yjs";
import {
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  type Awareness,
} from "y-protocols/awareness";
import type { DiagramSupabaseClient } from "./client.js";

const UPDATE_EVENT = "doc-update";
const SYNC_REQUEST_EVENT = "sync-request";
const SYNC_RESPONSE_EVENT = "sync-response";
const AWARENESS_EVENT = "awareness-update";

// never send one broadcast per pointer-move/keystroke (see CLAUDE.md
// Performance section) - local doc updates arriving within this window are
// merged into a single broadcast; local awareness changes (e.g. cursor
// moves) within this window collapse into re-sending just the latest state
const BROADCAST_THROTTLE_MS = 100;

// tags a transaction/awareness change as caused by something that arrived
// over the wire, so it's excluded from re-broadcasting and (for doc
// updates) from the local client's own Y.UndoManager (see
// diagram-crdt-core/src/undo.ts)
export const REMOTE_ORIGIN = "remote";

export type ConnectionStatus = "connected" | "disconnected";

export type DiagramDocHandlers = {
  // fires on every transition, including a reconnect after a drop - not
  // just the very first connect
  onStatusChange?: (status: ConnectionStatus) => void;
};

export type DiagramDocConnection = {
  channel: RealtimeChannel;
  disconnect: () => void;
};

/**
 * Joins a diagram's realtime channel and keeps both `doc` and `awareness`
 * (presence + live cursors - see diagram-crdt-core/src/awareness.ts) in sync
 * with every other client on it. Local changes are throttled and broadcast;
 * incoming ones are applied under REMOTE_ORIGIN. On every successful
 * (re)connect - the first one and any later reconnect after a drop - this
 * client re-sends its state vector and full awareness state, since anything
 * broadcast while disconnected is simply gone and needs to be caught up on.
 */
export const subscribeToDiagram = (
  client: DiagramSupabaseClient,
  diagramId: string,
  doc: Y.Doc,
  awareness: Awareness,
  handlers: DiagramDocHandlers = {}
): DiagramDocConnection => {
  const channel = client.channel(`diagram:${diagramId}`);

  let pendingUpdates: Uint8Array[] = [];
  let docFlushTimeout: ReturnType<typeof setTimeout> | null = null;

  const flushDoc = () => {
    docFlushTimeout = null;
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
    if (!docFlushTimeout)
      docFlushTimeout = setTimeout(flushDoc, BROADCAST_THROTTLE_MS);
  };
  doc.on("update", onDocUpdate);

  let awarenessDirty = false;
  let awarenessFlushTimeout: ReturnType<typeof setTimeout> | null = null;

  const flushAwareness = () => {
    awarenessFlushTimeout = null;
    if (!awarenessDirty) return;
    awarenessDirty = false;
    const update = encodeAwarenessUpdate(awareness, [awareness.clientID]);
    void channel.send({
      type: "broadcast",
      event: AWARENESS_EVENT,
      payload: { update: Array.from(update) },
    });
  };

  const onAwarenessUpdate = (
    _changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (origin === REMOTE_ORIGIN) return;
    awarenessDirty = true;
    if (!awarenessFlushTimeout) {
      awarenessFlushTimeout = setTimeout(flushAwareness, BROADCAST_THROTTLE_MS);
    }
  };
  awareness.on("update", onAwarenessUpdate);

  const sendFullAwarenessState = () => {
    void channel.send({
      type: "broadcast",
      event: AWARENESS_EVENT,
      payload: {
        update: Array.from(
          encodeAwarenessUpdate(awareness, [awareness.clientID])
        ),
      },
    });
  };

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
        // they just joined/rejoined - they won't have our cursor/user info
        // yet either, since awareness isn't part of the doc's state vector
        sendFullAwarenessState();
      }
    )
    .on(
      "broadcast",
      { event: SYNC_RESPONSE_EVENT },
      ({ payload }: { payload: { update: number[] } }) => {
        Y.applyUpdate(doc, Uint8Array.from(payload.update), REMOTE_ORIGIN);
      }
    )
    .on(
      "broadcast",
      { event: AWARENESS_EVENT },
      ({ payload }: { payload: { update: number[] } }) => {
        applyAwarenessUpdate(
          awareness,
          Uint8Array.from(payload.update),
          REMOTE_ORIGIN
        );
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // re-run the join handshake on every (re)connect, not just the
        // first - a dropped connection loses anything broadcast in between
        void channel.send({
          type: "broadcast",
          event: SYNC_REQUEST_EVENT,
          payload: { stateVector: Array.from(Y.encodeStateVector(doc)) },
        });
        sendFullAwarenessState();
        handlers.onStatusChange?.("connected");
      } else if (
        status === "CLOSED" ||
        status === "TIMED_OUT" ||
        status === "CHANNEL_ERROR"
      ) {
        handlers.onStatusChange?.("disconnected");
      }
    });

  return {
    channel,
    disconnect: () => {
      doc.off("update", onDocUpdate);
      awareness.off("update", onAwarenessUpdate);
      if (docFlushTimeout) clearTimeout(docFlushTimeout);
      if (awarenessFlushTimeout) clearTimeout(awarenessFlushTimeout);
      void channel.unsubscribe();
    },
  };
};
