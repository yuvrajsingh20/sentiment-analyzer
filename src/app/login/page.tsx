import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Sentiment Analyzer" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const store = await cookies();
  if (await verifySession(store.get(SESSION_COOKIE)?.value)) {
    redirect("/dashboard");
  }

  const { next } = await searchParams;
  // Only ever redirect to a same-origin path.
  const target = next && /^\/(?!\/)/.test(next) ? next : "/dashboard";

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-12">
      <div className="w-full max-w-[380px] rise">
        <div className="mb-7 flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{ background: "var(--pos)" }}
          >
            <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
              <path
                d="M7 21l5-7 4 4 4-8 5 6"
                stroke="white"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight">
              Sentiment Analyzer
            </h1>
            <p className="text-[12px] text-[var(--ink-3)]">
              Call intelligence for support and sales conversations
            </p>
          </div>
        </div>

        <LoginForm redirectTo={target} />

        <p className="mt-6 text-center text-[11px] leading-relaxed text-[var(--ink-3)]">
          Credentials come from <code className="font-mono">AUTH_USERNAME</code>{" "}
          and <code className="font-mono">AUTH_PASSWORD</code>.
        </p>
      </div>
    </main>
  );
}
