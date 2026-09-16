import { useContext } from "react";
import { SupabaseContext } from "@/supabase/context";

export const useSupabase = () => {
  const value = useContext(SupabaseContext);
  if (!value) {
    throw new Error("useSupabase must be used within a SupabaseProvider");
  }
  return value;
};
