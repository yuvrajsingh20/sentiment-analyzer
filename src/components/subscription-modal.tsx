"use client";

import { useCallback, useState } from "react";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type Plan = "basic" | "pro";

const PLANS: { id: Plan; name: string; price: string; priceNum: number; features: string[]; highlight?: boolean }[] = [
  {
    id: "basic",
    name: "Basic",
    price: "\u20b999/mo",
    priceNum: 9900,
    features: [
      "Unlimited analyses",
      "18 KPIs unlocked",
      "All presets & dashboards",
      "Analysis history",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "\u20b9149/mo",
    priceNum: 14900,
    highlight: true,
    features: [
      "All 27 KPIs unlocked",
      "Custom KPIs (up to 8)",
      "Unlimited analysis history",
      "Full feature access",
    ],
  },
];

export function SubscriptionModal({
  open,
  onClose,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  reason?: "free_limit" | "custom_kpi";
}) {
  const [loading, setLoading] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRazorpayScript = useCallback((): Promise<void> => {
    if (window.Razorpay) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Razorpay"));
      document.head.appendChild(script);
    });
  }, []);

  const subscribe = useCallback(
    async (plan: Plan) => {
      setLoading(plan);
      setError(null);

      try {
        await loadRazorpayScript();

        // Step 1: Create order on backend
        const res = await fetch("/api/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to create order");
        }

        const { orderId, amount, currency, keyId } = (await res.json()) as {
          orderId: string;
          amount: number;
          currency: string;
          keyId: string;
        };

        // Step 2: Open Razorpay checkout
        const rzp = new window.Razorpay({
          key: keyId,
          amount,
          currency,
          name: "Sentiment Analyzer",
          description: `${plan === "pro" ? "Pro" : "Basic"} Plan`,
          order_id: orderId,
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            // Step 3: Verify payment on backend
            try {
              const verifyRes = await fetch("/api/verify-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature,
                  plan,
                }),
              });

              if (!verifyRes.ok) {
                const data = (await verifyRes.json()) as { error?: string };
                setError(data.error ?? "Payment verification failed");
                setLoading(null);
                return;
              }

              onClose();
              window.location.reload();
            } catch {
              setError("Could not verify payment. Please contact support.");
              setLoading(null);
            }
          },
          prefill: {},
          theme: { color: "#18181b" },
          modal: {
            ondismiss: () => setLoading(null),
          },
        });

        rzp.open();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setLoading(null);
      }
    },
    [loadRazorpayScript, onClose],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
      <div className="relative w-full max-h-[95dvh] overflow-y-auto rounded-t-[20px] bg-[var(--surface-1)] px-5 pb-8 pt-6 shadow-2xl sm:mx-4 sm:max-w-[640px] sm:rounded-[16px] sm:p-8">
        {/* Drag handle on mobile */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--surface-3)] sm:hidden" />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-[var(--ink-3)] hover:text-[var(--ink-1)]"
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="mb-5 text-center sm:mb-6">
          <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-[var(--ink-1)] sm:text-[22px]">
            Upgrade your plan
          </h2>
          <p className="mt-1.5 text-[13px] text-[var(--ink-2)] sm:mt-2 sm:text-[14px]">
            {reason === "free_limit"
              ? "You\u2019ve used all 3 free analyses. Subscribe to continue."
              : reason === "custom_kpi"
                ? "Custom KPIs are available on the Pro plan."
                : "Unlock unlimited analyses and more features."}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-[8px] bg-red-50 px-4 py-2 text-[13px] text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-[12px] border p-5 transition-shadow sm:p-6 ${
                plan.highlight
                  ? "border-[var(--ink-1)] shadow-lg"
                  : "border-[var(--hairline)] shadow-sm"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--ink-1)] px-3 py-0.5 text-[11px] font-medium text-[var(--on-primary)]">
                  Recommended
                </span>
              )}
              <div className="flex items-baseline justify-between gap-2 sm:block">
                <p className="text-[15px] font-semibold text-[var(--ink-1)] sm:text-[16px]">{plan.name}</p>
                <p className="text-[24px] font-bold tracking-tight text-[var(--ink-1)] sm:mt-1 sm:text-[28px]">
                  {plan.price}
                </p>
              </div>
              <ul className="mt-3 space-y-1.5 sm:mt-4 sm:space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[12px] text-[var(--ink-2)] sm:text-[13px]">
                    <svg viewBox="0 0 20 20" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600 sm:h-4 sm:w-4" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={loading !== null}
                onClick={() => subscribe(plan.id)}
                className={`mt-4 w-full rounded-[8px] px-4 py-2.5 text-[13px] font-medium transition-colors sm:mt-6 sm:text-[14px] ${
                  plan.highlight
                    ? "bg-[var(--ink-1)] text-[var(--on-primary)] hover:opacity-90"
                    : "bg-[var(--surface-2)] text-[var(--ink-1)] hover:bg-[var(--surface-3)]"
                } disabled:opacity-50`}
              >
                {loading === plan.id ? "Processing\u2026" : `Subscribe`}
              </button>
            </div>
          ))}
        </div>

        {/* WhatsApp help CTA */}
        <div className="mt-5 flex flex-col items-center gap-2 sm:mt-6">
          <a
            href="https://wa.me/916262074299"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-[#25D366] hover:underline"
          >
            <svg viewBox="0 0 32 32" className="h-4 w-4" fill="currentColor">
              <path d="M16.004 0h-.008C7.174 0 0 7.176 0 16.004c0 3.5 1.128 6.744 3.046 9.378L1.054 31.29l6.118-1.958A15.914 15.914 0 0016.004 32C24.826 32 32 24.824 32 15.996S24.826 0 16.004 0zm9.35 22.606c-.39 1.1-1.932 2.014-3.172 2.28-.852.18-1.962.324-5.7-1.224-4.786-1.982-7.862-6.834-8.1-7.152-.228-.318-1.926-2.568-1.926-4.896s1.218-3.474 1.65-3.948c.432-.474.942-.594 1.254-.594.312 0 .624.002.9.016.288.016.676-.11 1.058.806.39.942 1.332 3.252 1.45 3.49.118.238.196.516.04.834-.158.318-.238.516-.476.794-.238.278-.5.622-.714.834-.238.238-.486.496-.208.97.278.474 1.234 2.036 2.65 3.3 1.822 1.624 3.358 2.126 3.832 2.364.474.238.75.198 1.028-.12.278-.318 1.194-1.392 1.512-1.87.318-.476.636-.396 1.07-.238.436.16 2.742 1.294 3.214 1.53.474.238.788.356.906.554.116.198.116 1.148-.274 2.248z" />
            </svg>
            Need help? Chat on WhatsApp
          </a>
          <p className="text-[11px] text-[var(--ink-3)]">
            Powered by Razorpay · Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
}
