import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { currentUsername } from "@/lib/session";

const KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";

function razorpayAuth(): string {
  return Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
}

export async function POST(request: Request) {
  const username = await currentUsername();
  if (!username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!KEY_ID || !KEY_SECRET) {
    return NextResponse.json({ error: "Payment gateway not configured" }, { status: 500 });
  }

  let amount: number;
  let planType: "basic" | "pro";

  try {
    const body = (await request.json()) as { plan?: string };
    if (body.plan === "basic") {
      planType = "basic";
      amount = 9900; // ₹99 in paise
    } else if (body.plan === "pro") {
      planType = "pro";
      amount = 14900; // ₹149 in paise
    } else {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (amount < 100) {
    return NextResponse.json({ error: "Amount must be at least 100 paise" }, { status: 400 });
  }

  try {
    const receipt = `rcpt_${planType}_${Date.now()}`;
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${razorpayAuth()}`,
      },
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt,
        notes: { username, plan: planType },
      }),
    });

    if (res.status === 401) {
      return NextResponse.json({ error: "Payment gateway auth failed" }, { status: 401 });
    }
    if (!res.ok) {
      const errText = await res.text();
      console.error("[create-order] Razorpay error:", errText);
      return NextResponse.json({ error: "Could not create order" }, { status: 500 });
    }

    const order = (await res.json()) as { id: string; amount: number; currency: string };
    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: KEY_ID,
      plan: planType,
    });
  } catch (error) {
    console.error("[create-order]", error);
    return NextResponse.json({ error: "Could not create order" }, { status: 500 });
  }
}
