import crypto from "node:crypto";
import { findUser, updateUser, type SubscriptionPlan } from "./users";

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";

const FREE_TRIAL_LIMIT = 3;

export const PLAN_IDS: Record<"basic" | "pro", string> = {
  basic: process.env.RAZORPAY_PLAN_BASIC_ID ?? "",
  pro: process.env.RAZORPAY_PLAN_PRO_ID ?? "",
};

/** Free plan: 10 core KPIs (customer group + resolution & escalation risk) */
export const FREE_KPI_IDS: string[] = [
  "customer.sentiment",
  "customer.frustration",
  "customer.effort",
  "customer.satisfaction",
  "customer.csatPredicted",
  "customer.npsCategory",
  "customer.escalationIntent",
  "customer.churnRisk",
  "conversation.resolutionStatus",
  "conversation.escalationRisk",
];

/** Basic plan: 18 KPIs (customer + agent + 3 conversation) */
export const BASIC_KPI_IDS: string[] = [
  ...FREE_KPI_IDS,
  "agent.sentiment",
  "agent.empathy",
  "agent.professionalism",
  "agent.responsiveness",
  "agent.activeListening",
  "agent.ownership",
  "agent.resolutionEffectiveness",
  "conversation.firstContactResolution",
];

export function allowedKpiIds(plan: SubscriptionPlan): string[] | null {
  if (plan === "pro") return null; // null = all allowed
  if (plan === "basic") return BASIC_KPI_IDS;
  return FREE_KPI_IDS;
}

export type PlanInfo = {
  plan: SubscriptionPlan;
  analysisCount: number;
  limit: number | null;
  canUseCustomKpis: boolean;
  allowedKpis: string[] | null;
  subscriptionStatus?: string;
};

export async function getUserPlanInfo(username: string): Promise<PlanInfo> {
  const user = await findUser(username);
  const plan = user?.plan ?? "free";
  const analysisCount = user?.analysisCount ?? 0;

  return {
    plan,
    analysisCount,
    limit: plan === "free" ? FREE_TRIAL_LIMIT : null,
    canUseCustomKpis: plan === "pro",
    allowedKpis: allowedKpiIds(plan),
    subscriptionStatus: user?.subscriptionStatus,
  };
}

export function canAnalyze(info: PlanInfo): { allowed: boolean; reason?: string } {
  if (info.plan === "free" && info.limit !== null && info.analysisCount >= info.limit) {
    return { allowed: false, reason: "free_limit_reached" };
  }
  return { allowed: true };
}

export function canUseCustomKpis(plan: SubscriptionPlan): boolean {
  return plan === "pro";
}

// --- Razorpay API helpers ---

function razorpayAuth(): string {
  return Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
}

export async function createSubscription(
  username: string,
  planType: "basic" | "pro",
): Promise<{ subscriptionId: string }> {
  const planId = PLAN_IDS[planType];
  if (!planId) throw new Error(`No Razorpay plan ID configured for ${planType}`);

  const res = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${razorpayAuth()}`,
    },
    body: JSON.stringify({
      plan_id: planId,
      total_count: 12,
      quantity: 1,
      notes: { username },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Razorpay subscription creation failed: ${err}`);
  }

  const data = (await res.json()) as { id: string };
  return { subscriptionId: data.id };
}

export function verifyWebhookSignature(body: string, signature: string): boolean {
  if (!RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = crypto
    .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function handleSubscriptionActivated(
  username: string,
  subscriptionId: string,
  planType: SubscriptionPlan,
  endAt?: string,
): Promise<void> {
  await updateUser(username, {
    plan: planType,
    subscriptionId,
    subscriptionStatus: "active",
    subscriptionEnd: endAt,
  });
}

export async function handleSubscriptionCancelled(username: string): Promise<void> {
  await updateUser(username, {
    plan: "free",
    subscriptionStatus: "cancelled",
    subscriptionId: undefined,
    subscriptionEnd: undefined,
  });
}

export { FREE_TRIAL_LIMIT };
