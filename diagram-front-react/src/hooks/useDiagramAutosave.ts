import { useEffect } from "react";
import { saveDiagramSnapshot } from "diagram-supabase-wrapper";
import { getSnapshot } from "diagram-crdt-core";
import { useSupabase } from "@/supabase/hooks";
import { diagramDoc } from "@/state";

// periodic-if-changed, not per-edit debounced - avoids one write per
// keystroke without risking indefinite deferral under continuous editing
// (see CLAUDE.md's Performance section and STAGE_6.md's Decisions)
const AUTOSAVE_INTERVAL_MS = 10_000;

/**
 * Keeps a diagram's Postgres snapshot fresh while it's joined: any client
 * connected can write it (no coordination between them - see STAGE_6.md),
 * so the true "everyone left, then someone comes back" case has real recent
 * state to load from, not just whatever was last manually saved. Silent by
 * design - autosave failures aren't surfaced anywhere (not scoped this
 * stage); the next interval tick, or another connected client, retries.
 */
export const useDiagramAutosave = (diagramId: string | null): void => {
  const { client, session } = useSupabase();

  useEffect(() => {
    if (!diagramId || !session) return;

    let dirty = false;
    const markDirty = () => {
      dirty = true;
    };
    diagramDoc.on("update", markDirty);

    const flush = () => {
      if (!dirty) return;
      dirty = false;
      saveDiagramSnapshot(client, diagramId, getSnapshot(diagramDoc)).catch(
        () => {}
      );
    };

    const interval = setInterval(flush, AUTOSAVE_INTERVAL_MS);

    return () => {
      diagramDoc.off("update", markDirty);
      clearInterval(interval);
      flush();
    };
  }, [client, session, diagramId]);
};
