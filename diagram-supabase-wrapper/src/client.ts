import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "supabase/database.types";

// re-exported so consumers don't need @supabase/supabase-js as a direct
// dependency just to type a session value
export type { Session } from "@supabase/supabase-js";

export type DiagramSupabaseClient = SupabaseClient<Database>;

export const createDiagramSupabaseClient = (
  url: string,
  anonKey: string
): DiagramSupabaseClient => createClient<Database>(url, anonKey);
