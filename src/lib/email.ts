import nodemailer from "nodemailer";

const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const ADMIN_EMAIL = "13yuvrajsingh2004@gmail.com";

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function sendPaymentConfirmation({
  to,
  username,
  plan,
  amount,
  paymentId,
  status,
}: {
  to: string;
  username: string;
  plan: "basic" | "pro";
  amount: string;
  paymentId: string;
  status: "success" | "pending";
}) {
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn("[email] SMTP not configured, skipping email");
    return;
  }

  const planName = plan === "pro" ? "Pro (₹149/mo)" : "Basic (₹99/mo)";
  const isSuccess = status === "success";

  const subject = isSuccess
    ? `✅ Payment Confirmed — ${planName}`
    : `⏳ Payment Pending — ${planName}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="color: #18181b; margin: 0 0 8px;">Sentiment Analyzer</h2>
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 16px 0;" />

      <h3 style="color: ${isSuccess ? "#16a34a" : "#d97706"}; margin: 24px 0 8px;">
        ${isSuccess ? "Payment Confirmed ✅" : "Payment Pending ⏳"}
      </h3>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #3f3f46;">
        <tr><td style="padding: 8px 0; color: #71717a;">Account</td><td style="padding: 8px 0; text-align: right;">${username}</td></tr>
        <tr><td style="padding: 8px 0; color: #71717a;">Plan</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${planName}</td></tr>
        <tr><td style="padding: 8px 0; color: #71717a;">Amount</td><td style="padding: 8px 0; text-align: right;">${amount}</td></tr>
        <tr><td style="padding: 8px 0; color: #71717a;">Payment ID</td><td style="padding: 8px 0; text-align: right; font-family: monospace; font-size: 12px;">${paymentId}</td></tr>
        <tr><td style="padding: 8px 0; color: #71717a;">Status</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${isSuccess ? "#16a34a" : "#d97706"};">${isSuccess ? "Confirmed" : "Pending"}</td></tr>
      </table>

      ${
        isSuccess
          ? '<p style="margin: 24px 0; font-size: 14px; color: #3f3f46;">Your plan is now active. You can start using all the features right away.</p>'
          : '<p style="margin: 24px 0; font-size: 14px; color: #3f3f46;">Your payment is being processed. You\'ll receive another email once it\'s confirmed. If it takes longer than expected, please contact us on WhatsApp.</p>'
      }

      <a href="https://wa.me/916262074299" style="display: inline-block; background: #25D366; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">Need help? Chat on WhatsApp</a>

      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
      <p style="font-size: 12px; color: #a1a1aa;">This email was sent by Sentiment Analyzer. If you didn't make this purchase, please contact us immediately.</p>
    </div>
  `;

  const transporter = getTransporter();

  // Send to customer
  await transporter.sendMail({
    from: `"Sentiment Analyzer" <${SMTP_USER}>`,
    to,
    subject,
    html,
  });

  // Notify admin
  await transporter.sendMail({
    from: `"Sentiment Analyzer" <${SMTP_USER}>`,
    to: ADMIN_EMAIL,
    subject: `[Admin] ${isSuccess ? "Payment" : "Pending"} — ${username} → ${planName}`,
    html: `<p><strong>${username}</strong> ${isSuccess ? "purchased" : "has a pending payment for"} the <strong>${planName}</strong> plan.</p>
           <p>Payment ID: <code>${paymentId}</code></p>
           <p>Amount: ${amount}</p>`,
  });
}
