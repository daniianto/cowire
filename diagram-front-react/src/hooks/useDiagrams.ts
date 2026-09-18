import { useCallback } from "react";
import { toast } from "sonner";
import {
  listDiagrams,
  saveDiagram,
  updateDiagram,
  loadDiagram as loadDiagramRequest,
  type DiagramSummary,
} from "diagram-supabase-wrapper";
import { getSnapshot } from "diagram-crdt-core";
import { useSupabase } from "@/supabase/hooks";
import { diagramDoc, useCanvasStore } from "@/state";
import type { Shape, Viewport } from "@/lib/geometry";

type DiagramData = { viewport: Viewport };
// pre-Stage-6 diagrams stored their shapes as plain JSON here too, since
// there was no CRDT snapshot yet - `shapes` is only ever read as a
// one-time fallback for a diagram saved before that stage
type LegacyDiagramData = DiagramData & { shapes?: Record<string, Shape> };

// save/load failures aren't tied to a specific form field (there's no
// persistent form to attach an inline error to) — they're the outcome of a
// background operation, so per CLAUDE.md they surface as toasts, not blocks.
// Each action is wrapped in useCallback so consumers (e.g. an effect that
// fetches the list on open) get a stable reference instead of a new
// function every render.
export const useDiagrams = () => {
  const { client, session } = useSupabase();

  const list = useCallback((): Promise<DiagramSummary[]> => {
    if (!session) return Promise.resolve([]);
    return listDiagrams(client, session.user.id);
  }, [client, session]);

  const save = useCallback(
    async (name: string): Promise<DiagramSummary | undefined> => {
      if (!session) return undefined;
      const { viewport } = useCanvasStore.getState();
      const data: DiagramData = { viewport };
      const crdtState = getSnapshot(diagramDoc);
      try {
        const summary = await saveDiagram(
          client,
          session.user.id,
          name,
          data,
          crdtState
        );
        toast.success(`Saved "${summary.name}"`);
        return summary;
      } catch {
        toast.error("Failed to save diagram");
        return undefined;
      }
    },
    [client, session]
  );

  // re-saves over an already-saved diagram in place, unlike save() which
  // always inserts a new row - see STAGE_8.md's "Save vs Save As" decision
  const update = useCallback(
    async (id: string): Promise<void> => {
      const { viewport } = useCanvasStore.getState();
      const data: DiagramData = { viewport };
      const crdtState = getSnapshot(diagramDoc);
      try {
        await updateDiagram(client, id, data, crdtState);
        toast.success("Saved");
      } catch {
        toast.error("Failed to save diagram");
      }
    },
    [client]
  );

  const load = useCallback(
    async (id: string): Promise<void> => {
      try {
        const record = await loadDiagramRequest(client, id);
        const data = record.data as LegacyDiagramData;
        if (record.crdtState) {
          useCanvasStore
            .getState()
            .loadSnapshot(record.crdtState, data.viewport);
        } else {
          // fallback for a diagram saved before Stage 6 - the next save or
          // autosave gives it a real snapshot
          useCanvasStore.getState().loadState(data.shapes ?? {}, data.viewport);
        }
        toast.success(`Loaded "${record.name}"`);
      } catch {
        toast.error("Failed to load diagram");
      }
    },
    [client]
  );

  return { list, save, update, load };
};
