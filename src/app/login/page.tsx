import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { AuthBrand } from "@/components/auth-brand";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  GOOGLE_OAUTH_ERRORS,
  googleClientId,
} from "@/lib/google-oauth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Sentiment Analyzer" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const store = await cookies();
  if (await verifySession(store.get(SESSION_COOKIE)?.value)) {
    redirect("/dashboard");
  }

  const { next, error } = await searchParams;
  const target = next && /^\/(?!\/)/.test(next) ? next : "/dashboard";
  const initialError = error
    ? (GOOGLE_OAUTH_ERRORS[error] ?? "Google sign-in failed.")
    : undefined;

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--plane)] px-5 py-12">
      <div className="w-full max-w-[420px]">
        <AuthBrand />
        <LoginForm
          redirectTo={target}
          initialError={initialError}
          googleClientId={googleClientId()}
        />
        <p className="mt-5 text-center type-caption leading-relaxed text-[var(--ink-3)]">
          Demo login: <code className="font-mono">analyst</code> /{" "}
          <code className="font-mono">change-me</code>
          <br />
          Or create your own account. Sessions expire after 12 hours.
          <br />
          <Link href="/" className="mt-2 inline-block text-[var(--ink-2)] hover:text-[var(--ink-1)]">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
