import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { AuthBrand } from "@/components/auth-brand";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { googleClientId } from "@/lib/google-oauth";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create account — Sentiment Analyzer" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const store = await cookies();
  if (await verifySession(store.get(SESSION_COOKIE)?.value)) {
    redirect("/dashboard");
  }

  const { next } = await searchParams;
  const target = next && /^\/(?!\/)/.test(next) ? next : "/dashboard";

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--plane)] px-5 py-12">
      <div className="w-full max-w-[420px]">
        <AuthBrand />
        <SignupForm
          redirectTo={target}
          googleClientId={googleClientId()}
        />
        <p className="mt-5 text-center type-caption leading-relaxed text-[var(--ink-3)]">
          Usernames are 3–32 characters, or use an email.
          <br />
          Passwords must be at least 8 characters.
          <br />
          <Link href="/" className="mt-2 inline-block text-[var(--ink-2)] hover:text-[var(--ink-1)]">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
