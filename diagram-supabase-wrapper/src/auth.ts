import type { Session } from "@supabase/supabase-js";
import type { DiagramSupabaseClient } from "./client.js";

export const signUp = async (
  client: DiagramSupabaseClient,
  email: string,
  password: string
): Promise<Session | null> => {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return data.session;
};

export const signIn = async (
  client: DiagramSupabaseClient,
  email: string,
  password: string
): Promise<Session> => {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data.session;
};

export const signOut = async (client: DiagramSupabaseClient): Promise<void> => {
  const { error } = await client.auth.signOut();
  if (error) throw error;
};

export const getSession = async (
  client: DiagramSupabaseClient
): Promise<Session | null> => {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
};
