import { getR2 } from "@/lib/r2";

/** True when this server can tile PDFs without a separate worker. */
export function canInlineTiling(): boolean {
  return getR2() != null && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}
