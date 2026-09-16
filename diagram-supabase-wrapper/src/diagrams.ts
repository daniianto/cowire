import type { DiagramSupabaseClient } from "./client.js";
import type { Json } from "supabase/database.types";

export type DiagramSummary = {
  id: string;
  name: string;
  updatedAt: string;
};

export type DiagramRecord = DiagramSummary & {
  data: Json;
};

export const listDiagrams = async (
  client: DiagramSupabaseClient
): Promise<DiagramSummary[]> => {
  const { data, error } = await client
    .from("diagrams")
    .select("id, name, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
  }));
};

export const loadDiagram = async (
  client: DiagramSupabaseClient,
  id: string
): Promise<DiagramRecord> => {
  const { data, error } = await client
    .from("diagrams")
    .select("id, name, data, updated_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    data: data.data,
    updatedAt: data.updated_at,
  };
};

export const saveDiagram = async (
  client: DiagramSupabaseClient,
  userId: string,
  name: string,
  data: Json
): Promise<DiagramSummary> => {
  const { data: row, error } = await client
    .from("diagrams")
    .insert({ user_id: userId, name, data })
    .select("id, name, updated_at")
    .single();
  if (error) throw error;
  return { id: row.id, name: row.name, updatedAt: row.updated_at };
};

export const updateDiagram = async (
  client: DiagramSupabaseClient,
  id: string,
  data: Json
): Promise<DiagramSummary> => {
  const { data: row, error } = await client
    .from("diagrams")
    .update({ data })
    .eq("id", id)
    .select("id, name, updated_at")
    .single();
  if (error) throw error;
  return { id: row.id, name: row.name, updatedAt: row.updated_at };
};

export const deleteDiagram = async (
  client: DiagramSupabaseClient,
  id: string
): Promise<void> => {
  const { error } = await client.from("diagrams").delete().eq("id", id);
  if (error) throw error;
};
