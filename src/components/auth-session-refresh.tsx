"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function AuthSessionRefresh() {
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {});

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
