import type { Awareness } from "diagram-crdt-core";

// scoped to whichever diagram is currently joined - unlike diagramDoc this
// doesn't persist shape data, so it's fine (and correct) to swap it out on
// every join/leave rather than keeping one for the whole session.
// useDiagramRealtime sets this; useCanvasInteraction reads it to publish
// local cursor moves without the two hooks needing to know about each other
let active: Awareness | null = null;

export const setActiveAwareness = (awareness: Awareness | null): void => {
  active = awareness;
};

export const getActiveAwareness = (): Awareness | null => active;
