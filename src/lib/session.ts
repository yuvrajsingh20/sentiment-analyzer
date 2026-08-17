import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./auth";

/** Username on the current request, or null if the session is missing/expired. */
export async function currentUsername(): Promise<string | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}
