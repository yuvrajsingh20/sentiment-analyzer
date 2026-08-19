import Link from "next/link";
import { BrandLogo } from "@/components/ui";
import { LandingNav } from "@/components/landing-nav";
import { StickyMobileCta } from "@/components/sticky-mobile-cta";

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-[var(--plane)] text-[var(--ink-1)]">
      <LandingNav />

      <main>
        <Hero />
        <ProductSection />
        <Features />
        <HowItWorks />
        <QualitySection />
        <PricingSection />
        <QuoteStrip />
        <CtaBanner />
      </main>

      <Footer />
      <StickyMobileCta />
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-4 pb-10 pt-10 sm:px-6 sm:pb-24 sm:pt-24">
      <p className="eyebrow mb-3 sm:mb-4">Call intelligence</p>
      <h1 className="type-display-xl max-w-[18ch] text-[var(--ink-1)]">
        Every judgement backed by a quote you can check.
      </h1>
      <p className="mt-4 max-w-[38rem] type-body-lg text-[var(--ink-2)] sm:mt-6">
        Upload a call transcript. Read overall sentiment, sentence-level labels,
        emotion and KPIs — then watch every cited line get matched back against
        the recording before it reaches the dashboard.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center sm:gap-4">
        <Link href="/signup" className="btn btn-primary w-full sm:w-auto">
          Start free trial
        </Link>
        <a href="/#pricing" className="btn btn-secondary w-full sm:w-auto">
          View pricing
        </a>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-[var(--ink-3)] sm:mt-8">
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-green-600" fill="currentColor"><path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.844-8.791a.75.75 0 00-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 10-1.114 1.004l2.25 2.5a.75.75 0 001.15-.043l4.25-5.5z" clipRule="evenodd" /></svg>
          3 free analyses
        </span>
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-green-600" fill="currentColor"><path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.844-8.791a.75.75 0 00-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 10-1.114 1.004l2.25 2.5a.75.75 0 001.15-.043l4.25-5.5z" clipRule="evenodd" /></svg>
          No credit card needed
        </span>
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-green-600" fill="currentColor"><path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.844-8.791a.75.75 0 00-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 10-1.114 1.004l2.25 2.5a.75.75 0 001.15-.043l4.25-5.5z" clipRule="evenodd" /></svg>
          Plans from ₹99/mo
        </span>
      </div>
    </section>
  );
}

function ProductSection() {
  return (
    <section id="product" className="scroll-mt-14 px-4 pb-24 sm:px-6">
      <div className="mx-auto w-full max-w-[1280px]">
        <DashboardMock />
      </div>
    </section>
  );
}

function DashboardMock() {
  return (
    <div className="card-product overflow-hidden p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-medium tracking-[-0.2px] text-[var(--ink-1)]">
            billing-escalation.txt
          </p>
          <p className="mt-0.5 type-caption text-[var(--ink-3)]">
            28 turns · 1.4s · verified
          </p>
        </div>
        <span className="chip">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--good)]" />
          Quality gate passed
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[12px] border border-[var(--hairline)] bg-[var(--plane)] p-5">
          <p className="eyebrow">Overall sentiment</p>
          <p className="mt-3 type-headline text-[var(--ink-1)]">Negative call</p>
          <p className="mt-2 type-body-sm text-[var(--ink-2)]">
            Third contact about a duplicate charge. Hostile throughout, ends
            with an ombudsman threat.
          </p>
          <div className="mt-5 flex h-3 overflow-hidden rounded-[4px] bg-[var(--surface-2)]">
            <span className="w-[18%] bg-[var(--pos)]" />
            <span className="w-[22%] bg-[var(--neu)]" />
            <span className="w-[60%] bg-[var(--neg)]" />
          </div>
          <div className="mt-2 flex justify-between type-caption text-[var(--ink-3)]">
            <span>▲ Positive 18%</span>
            <span>■ Neutral 22%</span>
            <span>▼ Negative 60%</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Kpi label="Frustration" value="87%" tone="critical" />
          <Kpi label="Churn risk" value="74%" tone="critical" />
          <Kpi label="Empathy" value="41%" tone="warning" />
          <Kpi label="Resolution" value="Escalated" tone="critical" />
        </div>
      </div>

      <div className="mt-4 rounded-[12px] border border-[var(--hairline)] bg-[var(--plane)] px-5 py-4">
        <p className="eyebrow mb-3">Sentiment across the call</p>
        <div className="flex h-24 items-end gap-1">
          {[28, 22, 18, 35, 42, 38, 55, 62, 48, 70, 78, 74, 66, 82, 88, 80, 72, 84, 90, 86].map(
            (h, i) => (
              <span
                key={i}
                className="flex-1 rounded-t-[4px]"
                style={{
                  height: `${h}%`,
                  background: h > 55 ? "var(--neg)" : h > 40 ? "var(--neu)" : "var(--pos)",
                }}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "critical" | "warning";
}) {
  const color = tone === "critical" ? "var(--critical)" : "var(--warning)";
  return (
    <div className="relative overflow-hidden rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-1)] px-4 py-4">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: color }}
      />
      <p className="eyebrow">{label}</p>
      <p className="mt-2 text-[22px] font-medium tracking-[-0.3px] text-[var(--ink-1)]">
        {value}
      </p>
      <p className="mt-1 type-caption text-[var(--ink-3)]">Inferred</p>
    </div>
  );
}

function Features() {
  const items = [
    {
      title: "Claims, not scores",
      body: "Each KPI is a value, a status, a reason, and the verbatim quotes it was drawn from. A number you cannot interrogate is a number you cannot act on.",
    },
    {
      title: "N/A is a correct answer",
      body: "If the transcript cannot support a KPI, the model abstains. A sales negotiation has no resolution status — inventing 0.5 would be worse than a gap.",
    },
    {
      title: "The gate runs first",
      body: "Every cited quote is string-matched back to the turn it claims. Fabrications are counted, shown, and — above a threshold — fail the analysis.",
    },
  ];

  return (
    <section className="mx-auto w-full max-w-[1280px] px-4 py-14 sm:px-6 sm:py-24">
      <p className="eyebrow mb-3">What you get</p>
      <h2 className="type-display-lg max-w-[18ch]">
        Built so a reviewer can disagree with it.
      </h2>
      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <article key={item.title} className="card p-6">
            <h3 className="type-card-title">{item.title}</h3>
            <p className="mt-3 type-body text-[var(--ink-2)]">{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Upload a transcript",
      body: "Drop a .txt file, paste the call, or start from a bundled sample. Speaker-prefixed lines parse into turns.",
    },
    {
      n: "02",
      title: "NLP engine analyses the call",
      body: "The transcript is processed through a multi-pass inference pipeline with structured extraction. Every quoted claim is then verified against the original turns before anything reaches the dashboard.",
    },
    {
      n: "03",
      title: "Read the call as a dashboard",
      body: "Overall Positive / Neutral / Negative, sentence-level labels, emotions, a conversation summary, charts, and the KPIs a phone call can actually support.",
    },
  ];

  return (
    <section
      id="how-it-works"
      className="scroll-mt-14 mx-auto w-full max-w-[1280px] px-4 py-14 sm:px-6 sm:py-24"
    >
      <p className="eyebrow mb-3">How it works</p>
      <h2 className="type-display-lg max-w-[16ch]">
        Upload. Analyse. Then verify.
      </h2>
      <div className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ol className="space-y-4">
          {steps.map((step) => (
            <li key={step.n} className="card p-6">
              <p className="type-caption font-medium text-[var(--ink-3)]">{step.n}</p>
              <h3 className="mt-2 type-card-title">{step.title}</h3>
              <p className="mt-2 type-body text-[var(--ink-2)]">{step.body}</p>
            </li>
          ))}
        </ol>
        <TranscriptMock />
      </div>
    </section>
  );
}

function TranscriptMock() {
  const turns = [
    {
      who: "Agent",
      role: "agent",
      text: "Good afternoon, billing team, how can I help?",
      sentiment: "Neutral",
      color: "var(--neu)",
    },
    {
      who: "Customer",
      role: "customer",
      text: "This is the third time. You've charged me twice and nobody has fixed it.",
      sentiment: "Negative",
      color: "var(--neg)",
    },
    {
      who: "Customer",
      role: "customer",
      text: "I want a supervisor, and I want it in writing.",
      sentiment: "Negative",
      color: "var(--neg)",
      moment: "Escalation trigger",
    },
  ];

  return (
    <div className="card-product p-6">
      <p className="eyebrow mb-4">Transcript with sentence-level sentiment</p>
      <ol className="space-y-3">
        {turns.map((turn, i) => (
          <li
            key={i}
            className="rounded-[8px] bg-[var(--plane)] px-4 py-3"
            style={{ borderLeft: `3px solid ${turn.color}` }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[14px] font-medium text-[var(--ink-1)]">
                {turn.who}
              </span>
              <span className="type-caption" style={{ color: turn.color }}>
                ▼ {turn.sentiment}
              </span>
            </div>
            <p className="mt-1.5 type-body-sm text-[var(--ink-1)]">{turn.text}</p>
            {turn.moment && (
              <p className="mt-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-1.5 type-caption text-[var(--ink-2)]">
                {turn.moment}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function QualitySection() {
  return (
    <section
      id="quality"
      className="scroll-mt-14 mx-auto w-full max-w-[1280px] px-4 py-14 sm:px-6 sm:py-24"
    >
      <p className="eyebrow mb-3">Quality gate</p>
      <h2 className="type-display-lg max-w-[20ch]">
        The model is a component. The gate is the product.
      </h2>
      <p className="mt-5 max-w-[38rem] type-body-lg text-[var(--ink-2)]">
        Coverage, grounding and abstentions are measured on this run — not
        promised in a model card. A paraphrase does not pass. Declining to
        answer is not penalised.
      </p>

      <div className="mt-12 card-product p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Rate label="Turn coverage" value="100%" hint="every turn labelled" />
          <Rate label="Evidence grounding" value="100%" hint="quotes found in the transcript" />
          <Rate label="Evidence coverage" value="96%" hint="answered claims citing evidence" />
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[var(--hairline-soft)] pt-6 sm:grid-cols-4">
          <Count label="Fabricated quotes" value="0" />
          <Count label="Unsupported claims" value="0" />
          <Count label="Abstentions" value="3" />
          <Count label="Schema valid" value="Yes" />
        </dl>
      </div>
    </section>
  );
}

function Rate({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[8px] bg-[var(--plane)] px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-body-sm text-[var(--ink-2)]">{label}</span>
        <span className="tabular text-[16px] font-medium text-[var(--ink-1)]">
          {value}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-[4px] bg-[var(--surface-2)]">
        <div className="h-full w-full rounded-[4px] bg-[var(--ink-1)]" />
      </div>
      <p className="mt-1 type-caption text-[var(--ink-3)]">{hint}</p>
    </div>
  );
}

function Count({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow text-[var(--ink-3)]">{label}</dt>
      <dd className="mt-1 tabular text-[18px] font-medium text-[var(--ink-1)]">
        {value}
      </dd>
    </div>
  );
}

function PricingSection() {
  const plans = [
    {
      name: "Free Trial",
      price: "₹0",
      period: "",
      features: [
        "3 free analyses",
        "10 core KPIs",
        "Dashboard & charts",
        "Quality gate verification",
      ],
      cta: "Get started free",
      href: "/signup",
      highlight: false,
    },
    {
      name: "Basic",
      price: "₹99",
      period: "/mo",
      features: [
        "Unlimited analyses",
        "18 KPIs unlocked",
        "All presets & dashboards",
        "Analysis history",
      ],
      cta: "Subscribe",
      href: "/signup",
      highlight: false,
    },
    {
      name: "Pro",
      price: "₹149",
      period: "/mo",
      features: [
        "All 27 KPIs unlocked",
        "Custom KPIs (up to 8)",
        "Unlimited analysis history",
        "Full feature access",
      ],
      cta: "Subscribe — best value",
      href: "/signup",
      highlight: true,
    },
  ];

  return (
    <section
      id="pricing"
      className="scroll-mt-14 mx-auto w-full max-w-[1280px] px-4 py-16 sm:px-6 sm:py-24"
    >
      <p className="eyebrow mb-3">Pricing</p>
      <h2 className="type-display-lg max-w-[20ch]">
        Start free. Upgrade when you need more.
      </h2>
      <p className="mt-4 max-w-[38rem] type-body-lg text-[var(--ink-2)] sm:mt-5">
        Try 10 analyses free. Then pick the plan that fits your workflow.
      </p>

      {/* Horizontal scroll on mobile, grid on desktop */}
      <div className="-mx-4 mt-8 flex gap-4 overflow-x-auto px-4 pb-4 snap-x snap-mandatory sm:mx-0 sm:px-0 sm:pb-0 md:mt-12 md:grid md:grid-cols-3 md:overflow-visible">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative flex min-w-[280px] shrink-0 snap-center flex-col rounded-[16px] border p-6 transition-shadow sm:min-w-0 sm:p-8 ${
              plan.highlight
                ? "border-[var(--ink-1)] shadow-xl"
                : "border-[var(--hairline)] shadow-sm"
            }`}
          >
            {plan.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--ink-1)] px-4 py-1 text-[11px] font-semibold tracking-wide text-[var(--on-primary)] uppercase">
                Most popular
              </span>
            )}
            <p className="text-[18px] font-semibold text-[var(--ink-1)]">{plan.name}</p>
            <p className="mt-2">
              <span className="text-[32px] font-bold tracking-tight text-[var(--ink-1)] sm:text-[36px]">
                {plan.price}
              </span>
              {plan.period && (
                <span className="ml-1 text-[14px] text-[var(--ink-3)]">{plan.period}</span>
              )}
            </p>
            <ul className="mt-5 flex-1 space-y-2.5 sm:mt-6 sm:space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13px] text-[var(--ink-2)] sm:text-[14px]">
                  <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-green-600" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href={plan.href}
              className={`mt-6 block w-full rounded-[8px] px-4 py-3 text-center text-[14px] font-medium transition-colors sm:mt-8 ${
                plan.highlight
                  ? "bg-[var(--ink-1)] text-[var(--on-primary)] hover:opacity-90"
                  : "bg-[var(--surface-2)] text-[var(--ink-1)] hover:bg-[var(--surface-3)]"
              }`}
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>

      {/* WhatsApp CTA — more prominent on mobile */}
      <div className="mt-8 flex flex-col items-center gap-3 sm:mt-10">
        <a
          href="https://wa.me/916262074299"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-[14px] font-medium text-white shadow-md transition-transform hover:scale-105 active:scale-95"
        >
          <svg viewBox="0 0 32 32" className="h-5 w-5" fill="currentColor">
            <path d="M16.004 0h-.008C7.174 0 0 7.176 0 16.004c0 3.5 1.128 6.744 3.046 9.378L1.054 31.29l6.118-1.958A15.914 15.914 0 0016.004 32C24.826 32 32 24.824 32 15.996S24.826 0 16.004 0zm9.35 22.606c-.39 1.1-1.932 2.014-3.172 2.28-.852.18-1.962.324-5.7-1.224-4.786-1.982-7.862-6.834-8.1-7.152-.228-.318-1.926-2.568-1.926-4.896s1.218-3.474 1.65-3.948c.432-.474.942-.594 1.254-.594.312 0 .624.002.9.016.288.016.676-.11 1.058.806.39.942 1.332 3.252 1.45 3.49.118.238.196.516.04.834-.158.318-.238.516-.476.794-.238.278-.5.622-.714.834-.238.238-.486.496-.208.97.278.474 1.234 2.036 2.65 3.3 1.822 1.624 3.358 2.126 3.832 2.364.474.238.75.198 1.028-.12.278-.318 1.194-1.392 1.512-1.87.318-.476.636-.396 1.07-.238.436.16 2.742 1.294 3.214 1.53.474.238.788.356.906.554.116.198.116 1.148-.274 2.248z" />
          </svg>
          Talk to us before buying
        </a>
        <p className="text-[12px] text-[var(--ink-3)]">
          We reply within minutes on WhatsApp
        </p>
      </div>
    </section>
  );
}

function QuoteStrip() {
  return (
    <section className="bg-[var(--inverse-canvas)] text-[var(--inverse-ink)]">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-14 sm:px-6 sm:py-24">
        <p className="type-display-md max-w-[22ch]">
          “0.87 because they asked for a supervisor twice — here are the two
          quotes — can be checked.”
        </p>
        <p className="mt-8 type-body-sm text-[var(--inverse-ink-muted)]">
          A bare 0.87 cannot. That is the difference this dashboard is built
          around.
        </p>
      </div>
    </section>
  );
}

function CtaBanner() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-4 py-16 sm:px-6 sm:py-24">
      <div className="card p-6 sm:p-12">
        <h2 className="type-headline max-w-[16ch]">
          Analyse your next support or sales call.
        </h2>
        <p className="mt-3 max-w-[32rem] type-body text-[var(--ink-2)]">
          Create an account, drop in a transcript, and read the result as a KPI
          board with the evidence still attached.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center sm:gap-4">
          <Link href="/signup" className="btn btn-primary w-full sm:w-auto">
            Start free trial
          </Link>
          <a
            href="https://wa.me/916262074299"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary w-full sm:w-auto inline-flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 32 32" className="h-4 w-4 text-[#25D366]" fill="currentColor">
              <path d="M16.004 0h-.008C7.174 0 0 7.176 0 16.004c0 3.5 1.128 6.744 3.046 9.378L1.054 31.29l6.118-1.958A15.914 15.914 0 0016.004 32C24.826 32 32 24.824 32 15.996S24.826 0 16.004 0zm9.35 22.606c-.39 1.1-1.932 2.014-3.172 2.28-.852.18-1.962.324-5.7-1.224-4.786-1.982-7.862-6.834-8.1-7.152-.228-.318-1.926-2.568-1.926-4.896s1.218-3.474 1.65-3.948c.432-.474.942-.594 1.254-.594.312 0 .624.002.9.016.288.016.676-.11 1.058.806.39.942 1.332 3.252 1.45 3.49.118.238.196.516.04.834-.158.318-.238.516-.476.794-.238.278-.5.622-.714.834-.238.238-.486.496-.208.97.278.474 1.234 2.036 2.65 3.3 1.822 1.624 3.358 2.126 3.832 2.364.474.238.75.198 1.028-.12.278-.318 1.194-1.392 1.512-1.87.318-.476.636-.396 1.07-.238.436.16 2.742 1.294 3.214 1.53.474.238.788.356.906.554.116.198.116 1.148-.274 2.248z" />
            </svg>
            Chat on WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--hairline-soft)] bg-[var(--plane)] px-4 pb-24 pt-12 sm:px-6 sm:pb-16 sm:pt-16">
      <div className="mx-auto grid w-full max-w-[1280px] gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <BrandLogo className="h-8" />
          <p className="mt-4 max-w-sm type-caption text-[var(--ink-3)]">
            Call intelligence for support and sales conversations. Judgements
            stay attached to the quotes that produced them.
          </p>
        </div>
        <div>
          <p className="eyebrow text-[var(--ink-1)]">Product</p>
          <ul className="mt-3 space-y-2 type-caption text-[var(--ink-3)]">
            <li>
              <a href="/#product" className="hover:text-[var(--ink-1)]">
                Dashboard
              </a>
            </li>
            <li>
              <a href="/#how-it-works" className="hover:text-[var(--ink-1)]">
                How it works
              </a>
            </li>
            <li>
              <a href="/#quality" className="hover:text-[var(--ink-1)]">
                Quality gate
              </a>
            </li>
            <li>
              <a href="/#pricing" className="hover:text-[var(--ink-1)]">
                Pricing
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="eyebrow text-[var(--ink-1)]">Account</p>
          <ul className="mt-3 space-y-2 type-caption text-[var(--ink-3)]">
            <li>
              <Link href="/login" className="hover:text-[var(--ink-1)]">
                Sign in
              </Link>
            </li>
            <li>
              <Link href="/signup" className="hover:text-[var(--ink-1)]">
                Create an account
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
