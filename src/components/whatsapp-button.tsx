"use client";

import { useEffect, useState } from "react";

const WHATSAPP_NUMBER = "916262074299";
const MESSAGE = "Hi, I have a question about Sentiment Analyzer subscription plans.";

export function WhatsAppButton() {
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(MESSAGE)}`;
  const [showLabel, setShowLabel] = useState(false);

  // Show the expanded label after 3s to catch attention without being intrusive on load
  useEffect(() => {
    const timer = setTimeout(() => setShowLabel(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className="fixed bottom-20 right-4 z-50 flex items-center gap-2.5 rounded-full bg-[#25D366] text-white shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6"
      style={{ padding: showLabel ? "10px 18px 10px 14px" : "14px" }}
    >
      <span className="relative flex h-7 w-7 items-center justify-center sm:h-7 sm:w-7">
        <span className="absolute inset-0 animate-ping rounded-full bg-white/30" />
        <svg viewBox="0 0 32 32" className="relative h-7 w-7" fill="currentColor">
          <path d="M16.004 0h-.008C7.174 0 0 7.176 0 16.004c0 3.5 1.128 6.744 3.046 9.378L1.054 31.29l6.118-1.958A15.914 15.914 0 0016.004 32C24.826 32 32 24.824 32 15.996S24.826 0 16.004 0zm9.35 22.606c-.39 1.1-1.932 2.014-3.172 2.28-.852.18-1.962.324-5.7-1.224-4.786-1.982-7.862-6.834-8.1-7.152-.228-.318-1.926-2.568-1.926-4.896s1.218-3.474 1.65-3.948c.432-.474.942-.594 1.254-.594.312 0 .624.002.9.016.288.016.676-.11 1.058.806.39.942 1.332 3.252 1.45 3.49.118.238.196.516.04.834-.158.318-.238.516-.476.794-.238.278-.5.622-.714.834-.238.238-.486.496-.208.97.278.474 1.234 2.036 2.65 3.3 1.822 1.624 3.358 2.126 3.832 2.364.474.238.75.198 1.028-.12.278-.318 1.194-1.392 1.512-1.87.318-.476.636-.396 1.07-.238.436.16 2.742 1.294 3.214 1.53.474.238.788.356.906.554.116.198.116 1.148-.274 2.248z" />
        </svg>
      </span>
      {showLabel && (
        <span className="whitespace-nowrap text-[13px] font-medium sm:text-[14px]">
          Chat with us
        </span>
      )}
    </a>
  );
}
