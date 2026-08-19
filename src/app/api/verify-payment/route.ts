import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { sendPaymentConfirmation } from "@/lib/email";
import { currentUsername } from "@/lib/session";
import { findUser, updateUser } from "@/lib/users";

const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";

export async function POST(request: Request) {
  const username = await currentUsername();
  if (!username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let razorpay_payment_id: string;
  let razorpay_order_id: string;
  let razorpay_signature: string;
  let plan: "basic" | "pro";

  try {
    const body = (await request.json()) as Record<string, unknown>;
    razorpay_payment_id = body.razorpay_payment_id as string;
    razorpay_order_id = body.razorpay_order_id as string;
    razorpay_signature = body.razorpay_signature as string;
    plan = body.plan as "basic" | "pro";

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !plan) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (plan !== "basic" && plan !== "pro") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const generatedSignature = crypto
    .createHmac("sha256", KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (generatedSignature !== razorpay_signature) {
    console.error("[verify-payment] Signature mismatch for order:", razorpay_order_id);
    return NextResponse.json({ error: "Payment verification failed" }, { status: 400 });
  }

  try {
    await updateUser(username, {
      plan,
      subscriptionStatus: "active",
      subscriptionId: razorpay_payment_id,
    });
  } catch (error) {
    console.error("[verify-payment] Failed to update user plan:", error);
    return NextResponse.json({ error: "Payment verified but failed to update plan" }, { status: 500 });
  }

  // Send confirmation email (fire-and-forget)
  const user = await findUser(username);
  const email = user?.email ?? username;
  const amount = plan === "pro" ? "₹149" : "₹99";
  sendPaymentConfirmation({
    to: email,
    username,
    plan,
    amount,
    paymentId: razorpay_payment_id,
    status: "success",
  }).catch((err) => console.error("[verify-payment] email failed:", err));

  return NextResponse.json({ success: true, plan });
}
