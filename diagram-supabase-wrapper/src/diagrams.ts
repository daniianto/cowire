import type { DiagramSupabaseClient } from "./client.js";
import type { Json } from "supabase/database.types";

export type DiagramSummary = {
  id: string;
  name: string;
  updatedAt: string;
};

export type DiagramRecord = DiagramSummary & {
  data: Json;
  // the Yjs snapshot from Stage 6 onward - null for a diagram saved before
  // that stage, or one that has never been autosaved/saved since
  crdtState: Uint8Array | null;
};

// PostgREST represents a `bytea` column as a "\x"-prefixed hex string on
// both read and write (confirmed against the real local instance) - these
// helpers are the only place that encoding is dealt with
const bytesToHex = (bytes: Uint8Array): string => {
  let hex = "\\x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
};

const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.startsWith("\\x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

export const listDiagrams = async (
  client: DiagramSupabaseClient,
  userId: string
): Promise<DiagramSummary[]> => {
  // RLS permits any authenticated user to select any diagram (needed so a
  // collaborator can open a shared link) - "my diagrams" is enforced here
  // via an explicit filter, not by the database policy
  const { data, error } = await client
    .from("diagrams")
    .select("id, name, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
  }));
};

// non-owner load/save go through get_shared_diagram/update_shared_diagram
// (SECURITY DEFINER functions - see Stage 10's secure_diagram_sharing
// migration) instead of the `diagrams` table directly: RLS can't express
// "only if you already knew this specific id" for a raw SELECT/UPDATE, so
// the table itself is owner-only now. The owner routes through the same
// functions too, rather than keeping a second, owner-only code path.
export const loadDiagram = async (
  client: DiagramSupabaseClient,
  id: string
): Promise<DiagramRecord> => {
  const { data, error } = await client
    .rpc("get_shared_diagram", { diagram_id: id })
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    data: data.data,
    crdtState: data.crdt_state ? hexToBytes(data.crdt_state) : null,
    updatedAt: data.updated_at,
  };
};

export const saveDiagram = async (
  client: DiagramSupabaseClient,
  userId: string,
  name: string,
  data: Json,
  crdtState: Uint8Array
): Promise<DiagramSummary> => {
  const { data: row, error } = await client
    .from("diagrams")
    .insert({ user_id: userId, name, data, crdt_state: bytesToHex(crdtState) })
    .select("id, name, updated_at")
    .single();
  if (error) throw error;
  return { id: row.id, name: row.name, updatedAt: row.updated_at };
};

export const updateDiagram = async (
  client: DiagramSupabaseClient,
  id: string,
  data: Json,
  crdtState: Uint8Array
): Promise<void> => {
  const { error } = await client.rpc("update_shared_diagram", {
    diagram_id: id,
    new_data: data,
    new_crdt_state: bytesToHex(crdtState),
  });
  if (error) throw error;
};

/** Autosave-only write: refreshes just the CRDT snapshot, leaving `data`/`name` untouched. */
export const saveDiagramSnapshot = async (
  client: DiagramSupabaseClient,
  id: string,
  crdtState: Uint8Array
): Promise<void> => {
  const { error } = await client.rpc("update_shared_diagram", {
    diagram_id: id,
    new_data: null,
    new_crdt_state: bytesToHex(crdtState),
  });
  if (error) throw error;
};

export const deleteDiagram = async (
  client: DiagramSupabaseClient,
  id: string
): Promise<void> => {
  const { error } = await client.from("diagrams").delete().eq("id", id);
  if (error) throw error;
};
