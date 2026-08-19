import { NextResponse } from "next/server";
import { currentUsername } from "@/lib/session";
import { createSubscription } from "@/lib/subscription";

export async function POST(request: Request) {
  const username = await currentUsername();
  if (!username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let planType: "basic" | "pro";
  try {
    const body = (await request.json()) as { plan?: string };
    if (body.plan !== "basic" && body.plan !== "pro") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    planType = body.plan;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const { subscriptionId } = await createSubscription(username, planType);
    return NextResponse.json({
      subscriptionId,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("[subscription/create]", error);
    return NextResponse.json({ error: "Could not create subscription" }, { status: 500 });
  }
}
