import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createDiagramSupabaseClient } from "diagram-supabase-wrapper";
import { SupabaseContext } from "@/supabase/context";
import type { Session } from "diagram-supabase-wrapper";

type SupabaseProviderProps = {
  children: ReactNode;
};

export const SupabaseProvider = ({ children }: SupabaseProviderProps) => {
  const client = useMemo(
    () =>
      createDiagramSupabaseClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      ),
    []
  );

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // keeps session in sync across sign-in/sign-out/token-refresh, including
    // changes made in another tab
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, [client]);

  return (
    <SupabaseContext.Provider value={{ client, session, loading }}>
      {children}
    </SupabaseContext.Provider>
  );
};
