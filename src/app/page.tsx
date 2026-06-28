import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  let user = null;
  try {
    user = await getSession();
  } catch {
    // If auth backend is temporarily unavailable, fall back to login route.
  }
  redirect(user ? "/projects" : "/login");
}
