import { useCallback } from "react";
import { toast } from "sonner";
import {
  listDiagrams,
  saveDiagram,
  loadDiagram as loadDiagramRequest,
  type DiagramSummary,
} from "diagram-supabase-wrapper";
import { useSupabase } from "@/supabase/hooks";
import { useCanvasStore } from "@/state";
import type { Shape, Viewport } from "@/lib/geometry";

type SerializedDiagram = {
  shapes: Record<string, Shape>;
  viewport: Viewport;
};

// save/load failures aren't tied to a specific form field (there's no
// persistent form to attach an inline error to) — they're the outcome of a
// background operation, so per CLAUDE.md they surface as toasts, not blocks.
// Each action is wrapped in useCallback so consumers (e.g. an effect that
// fetches the list on open) get a stable reference instead of a new
// function every render.
export const useDiagrams = () => {
  const { client, session } = useSupabase();

  const list = useCallback(
    (): Promise<DiagramSummary[]> => listDiagrams(client),
    [client]
  );

  const save = useCallback(
    async (name: string): Promise<DiagramSummary | undefined> => {
      if (!session) return undefined;
      const { shapes, viewport } = useCanvasStore.getState();
      const data: SerializedDiagram = { shapes, viewport };
      try {
        const summary = await saveDiagram(client, session.user.id, name, data);
        toast.success(`Saved "${summary.name}"`);
        return summary;
      } catch {
        toast.error("Failed to save diagram");
        return undefined;
      }
    },
    [client, session]
  );

  const load = useCallback(
    async (id: string): Promise<void> => {
      try {
        const record = await loadDiagramRequest(client, id);
        const data = record.data as SerializedDiagram;
        useCanvasStore.getState().loadState(data.shapes, data.viewport);
        toast.success(`Loaded "${record.name}"`);
      } catch {
        toast.error("Failed to load diagram");
      }
    },
    [client]
  );

  return { list, save, load };
};
