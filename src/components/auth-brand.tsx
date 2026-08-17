import Link from "next/link";
import { BrandLogo } from "@/components/ui";

export function AuthBrand() {
  return (
    <header className="mb-8 rise">
      <Link href="/" aria-label="Sentiment Analyzer home">
        <BrandLogo className="h-12" alt="" />
      </Link>
      <div className="mt-5">
        <h1 className="text-[18px] font-medium tracking-[-0.2px] text-[var(--ink-1)]">
          Sentiment Analyzer
        </h1>
        <p className="mt-0.5 type-caption text-[var(--ink-3)]">
          Call intelligence for support and sales conversations
        </p>
      </div>
    </header>
  );
}
