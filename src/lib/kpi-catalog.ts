/**
 * Built-in KPIs the reviewer can turn on or off before an analysis.
 *
 * IDs match `kpis.<group>.<key>` in the analysis contract. Custom names are
 * extra and come back as `analysis.customKpis`.
 */

export type KpiGroupId = "customer" | "agent" | "company" | "conversation";

export type CatalogKpi = {
  id: string;
  group: KpiGroupId;
  label: string;
};

export const KPI_GROUP_LABEL: Record<KpiGroupId, string> = {
  customer: "Customer",
  agent: "Agent",
  company: "Company",
  conversation: "Conversation",
};

export const KPI_CATALOG: CatalogKpi[] = [
  { id: "customer.sentiment", group: "customer", label: "Customer sentiment" },
  { id: "customer.frustration", group: "customer", label: "Frustration" },
  { id: "customer.effort", group: "customer", label: "Customer effort" },
  { id: "customer.satisfaction", group: "customer", label: "Satisfaction" },
  { id: "customer.csatPredicted", group: "customer", label: "Predicted CSAT" },
  { id: "customer.npsCategory", group: "customer", label: "Likely NPS" },
  { id: "customer.escalationIntent", group: "customer", label: "Escalation intent" },
  { id: "customer.churnRisk", group: "customer", label: "Churn risk" },
  { id: "agent.sentiment", group: "agent", label: "Agent sentiment" },
  { id: "agent.empathy", group: "agent", label: "Empathy" },
  { id: "agent.professionalism", group: "agent", label: "Professionalism" },
  { id: "agent.responsiveness", group: "agent", label: "Responsiveness" },
  { id: "agent.activeListening", group: "agent", label: "Active listening" },
  { id: "agent.ownership", group: "agent", label: "Ownership" },
  { id: "agent.resolutionEffectiveness", group: "agent", label: "Resolution effectiveness" },
  { id: "company.brandSentiment", group: "company", label: "Brand sentiment" },
  { id: "company.slaAdherence", group: "company", label: "SLA adherence" },
  { id: "company.processEffectiveness", group: "company", label: "Process effectiveness" },
  { id: "company.policyClarity", group: "company", label: "Policy clarity" },
  { id: "company.knowledgeAccuracy", group: "company", label: "Knowledge accuracy" },
  { id: "company.reputationalRisk", group: "company", label: "Reputational risk" },
  { id: "company.revenueAtRisk", group: "company", label: "Revenue at risk" },
  { id: "company.repeatContactRisk", group: "company", label: "Repeat-contact risk" },
  { id: "conversation.resolutionStatus", group: "conversation", label: "Resolution" },
  { id: "conversation.firstContactResolution", group: "conversation", label: "First-contact resolution" },
  { id: "conversation.escalationRisk", group: "conversation", label: "Escalation risk" },
  { id: "conversation.urgency", group: "conversation", label: "Urgency" },
  { id: "conversation.issueCategory", group: "conversation", label: "Issue category" },
];

export const ALL_KPI_IDS = KPI_CATALOG.map((k) => k.id);

export const KPI_PRESETS: Array<{ id: string; label: string; ids: string[] }> = [
  { id: "all", label: "All KPIs", ids: ALL_KPI_IDS },
  {
    id: "cx",
    label: "Customer experience",
    ids: KPI_CATALOG.filter((k) => k.group === "customer").map((k) => k.id),
  },
  {
    id: "agent",
    label: "Agent quality",
    ids: KPI_CATALOG.filter((k) => k.group === "agent").map((k) => k.id),
  },
  {
    id: "risk",
    label: "Risk & commercial",
    ids: [
      "customer.escalationIntent",
      "customer.churnRisk",
      "company.reputationalRisk",
      "company.revenueAtRisk",
      "company.repeatContactRisk",
      "conversation.escalationRisk",
    ],
  },
  {
    id: "outcome",
    label: "Call outcome",
    ids: KPI_CATALOG.filter((k) => k.group === "conversation").map((k) => k.id),
  },
];

export type KpiFocus = {
  ids: string[];
  custom: string[];
  /** True when the brief is the full catalogue — prompt stays unchanged. */
  all: boolean;
};

const KNOWN = new Set(ALL_KPI_IDS);

export function parseCustomKpis(raw: unknown): string[] {
  const text = Array.isArray(raw)
    ? raw.map(String).join("\n")
    : typeof raw === "string"
      ? raw
      : "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\n,;]+/)) {
    const label = part.trim().replace(/\s+/g, " ").slice(0, 80);
    if (label.length < 2) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= 8) break;
  }
  return out;
}

export function normalizeKpiFocus(selected?: unknown, custom?: unknown): KpiFocus {
  const customLabels = parseCustomKpis(custom);
  let list: unknown = selected;
  if (typeof selected === "string") {
    const trimmed = selected.trim();
    if (!trimmed) list = [];
    else if (trimmed.startsWith("[")) {
      try {
        list = JSON.parse(trimmed);
      } catch {
        list = trimmed.split(/[\n,]+/);
      }
    } else list = trimmed.split(/[\n,]+/);
  }
  const raw = Array.isArray(list) ? list.map(String) : [];
  const ids = [...new Set(raw.filter((id) => KNOWN.has(id)))];

  if (ids.length === 0 && customLabels.length === 0) {
    return { ids: ALL_KPI_IDS, custom: [], all: true };
  }

  const all = customLabels.length === 0 && ids.length === ALL_KPI_IDS.length;
  return { ids: ids.length ? ids : [], custom: customLabels, all };
}

export function kpiFocusBrief(focus: KpiFocus): string {
  if (focus.all) return "";

  const selected = KPI_CATALOG.filter((k) => focus.ids.includes(k.id));
  const byGroup = new Map<KpiGroupId, string[]>();
  for (const k of selected) {
    const list = byGroup.get(k.group) ?? [];
    list.push(`- ${k.id} (${k.label})`);
    byGroup.set(k.group, list);
  }

  const lines: string[] = [
    "# Reviewer brief — KPI focus",
    "This run has a KPI brief. Score the listed KPIs in depth, with evidence.",
  ];

  for (const group of ["customer", "agent", "company", "conversation"] as const) {
    const items = byGroup.get(group);
    if (!items?.length) continue;
    lines.push("", `## ${KPI_GROUP_LABEL[group]}`, ...items);
  }

  if (focus.custom.length) {
    lines.push(
      "",
      "## Custom KPIs",
      "Return these in `customKpis` as objects `{ label, value (0-1 number or a short string), status, confidence, reason, evidence }`.",
      ...focus.custom.map((label) => `- ${label}`),
    );
  }

  lines.push(
    "",
    'For every built-in KPI that is NOT listed above: set `status: "insufficient_evidence"`, `value: null`, `reason: "Not in the requested KPI set."`, `evidence: []`.',
    "Still return the full `kpis` object so the schema is complete.",
  );

  return `\n\n${lines.join("\n")}\n`;
}
