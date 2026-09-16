import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "supabase/database.types";

export type DiagramSupabaseClient = SupabaseClient<Database>;

export const createDiagramSupabaseClient = (
  url: string,
  anonKey: string
): DiagramSupabaseClient => createClient<Database>(url, anonKey);
