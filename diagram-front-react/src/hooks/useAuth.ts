import {
  signUp as signUpRequest,
  signIn as signInRequest,
  signOut as signOutRequest,
} from "diagram-supabase-wrapper";
import { useSupabase } from "@/supabase/hooks";

export const useAuth = () => {
  const { client, session, loading } = useSupabase();

  const signUp = (email: string, password: string) =>
    signUpRequest(client, email, password);
  const signIn = (email: string, password: string) =>
    signInRequest(client, email, password);
  const signOut = () => signOutRequest(client);

  return { session, loading, signUp, signIn, signOut };
};
