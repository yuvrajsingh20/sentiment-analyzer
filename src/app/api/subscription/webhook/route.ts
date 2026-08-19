import { NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  handleSubscriptionActivated,
  handleSubscriptionCancelled,
  PLAN_IDS,
} from "@/lib/subscription";
import type { SubscriptionPlan } from "@/lib/users";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  if (!verifyWebhookSignature(body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(body) as {
    event: string;
    payload: {
      subscription: {
        entity: {
          id: string;
          plan_id: string;
          notes: { username?: string };
          current_end?: number;
          status: string;
        };
      };
    };
  };

  const sub = event.payload.subscription.entity;
  const username = sub.notes.username;
  if (!username) {
    return NextResponse.json({ ok: true });
  }

  const planType: SubscriptionPlan =
    sub.plan_id === PLAN_IDS.pro ? "pro" : sub.plan_id === PLAN_IDS.basic ? "basic" : "free";

  if (event.event === "subscription.activated" || event.event === "subscription.charged") {
    const endAt = sub.current_end
      ? new Date(sub.current_end * 1000).toISOString()
      : undefined;
    await handleSubscriptionActivated(username, sub.id, planType, endAt);
  } else if (
    event.event === "subscription.cancelled" ||
    event.event === "subscription.expired"
  ) {
    await handleSubscriptionCancelled(username);
  }

  return NextResponse.json({ ok: true });
}
