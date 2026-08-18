import Link from "next/link";
import { BrandLogo } from "@/components/ui";
import { LandingNav } from "@/components/landing-nav";

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
        <QuoteStrip />
        <CtaBanner />
      </main>

      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
      <p className="eyebrow mb-4">Call intelligence</p>
      <h1 className="type-display-xl max-w-[18ch] text-[var(--ink-1)]">
        Every judgement backed by a quote you can check.
      </h1>
      <p className="mt-6 max-w-[38rem] type-body-lg text-[var(--ink-2)]">
        Upload a call transcript. Read overall sentiment, sentence-level labels,
        emotion and KPIs — then watch every cited line get matched back against
        the recording before it reaches the dashboard.
      </p>
      <div className="mt-8">
        <Link href="/signup" className="btn btn-primary">
          Get started
        </Link>
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
    <section className="mx-auto w-full max-w-[1280px] px-4 py-24 sm:px-6">
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
      title: "Gemini analyses the call",
      body: "The transcript is sent to Gemini as structured JSON. Every quoted claim is then checked against the original turns before anything reaches the dashboard.",
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
      className="scroll-mt-14 mx-auto w-full max-w-[1280px] px-4 py-24 sm:px-6"
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
      className="scroll-mt-14 mx-auto w-full max-w-[1280px] px-4 py-24 sm:px-6"
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

function QuoteStrip() {
  return (
    <section className="bg-[var(--inverse-canvas)] text-[var(--inverse-ink)]">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-24 sm:px-6">
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
    <section className="mx-auto w-full max-w-[1280px] px-4 py-24 sm:px-6">
      <div className="card p-12">
        <h2 className="type-headline max-w-[16ch]">
          Analyse your next support or sales call.
        </h2>
        <p className="mt-3 max-w-[32rem] type-body text-[var(--ink-2)]">
          Create an account, drop in a transcript, and read the result as a KPI
          board with the evidence still attached.
        </p>
        <div className="mt-8">
          <Link href="/signup" className="btn btn-primary">
            Get started
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--hairline-soft)] bg-[var(--plane)] px-4 py-16 sm:px-6">
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
