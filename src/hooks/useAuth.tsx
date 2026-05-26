import { useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for OAuth errors in the URL immediately
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);
    const error = hashParams.get("error") || queryParams.get("error");
    const errorDescription = hashParams.get("error_description") || queryParams.get("error_description");

    if (error) {
      import("@/hooks/use-toast").then(({ toast }) => {
        toast({
          title: "Erro no login",
          description: errorDescription === "access_denied" ? "Você cancelou o login via provedor." : "Ocorreu um erro ao fazer login.",
          variant: "destructive",
        });
      });
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Set up listener BEFORE getting session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Then get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, session, loading, signOut };
};
