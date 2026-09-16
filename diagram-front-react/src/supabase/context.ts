import { createContext } from "react";
import type { DiagramSupabaseClient, Session } from "diagram-supabase-wrapper";

export type SupabaseContextValue = {
  client: DiagramSupabaseClient;
  session: Session | null;
  // true only until the initial getSession() call resolves
  loading: boolean;
};

export const SupabaseContext = createContext<SupabaseContextValue | null>(null);
