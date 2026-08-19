"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function StickyMobileCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 400);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hairline)] bg-[var(--plane)]/95 backdrop-blur-md px-4 py-3 sm:hidden">
      <div className="flex items-center gap-3">
        <Link
          href="/signup"
          className="btn btn-primary flex-1 justify-center text-[14px]"
        >
          Start free trial
        </Link>
        <a
          href="/#pricing"
          className="btn btn-secondary flex-1 justify-center text-[14px]"
        >
          See pricing
        </a>
      </div>
    </div>
  );
}
