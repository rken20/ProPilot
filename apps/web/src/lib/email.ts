import "server-only";

/**
 * Transactional email. Uses Resend when RESEND_API_KEY is set, otherwise SMTP
 * (e.g. a Gmail app password) when SMTP_HOST/SMTP_USER/SMTP_PASS are set.
 * With neither, sending is skipped and the app keeps working.
 */
export type Email = { to: string[]; subject: string; text: string; html: string; replyTo?: string };
export type SendResult = { sent: boolean; reason?: string };

export function emailProvider(): "resend" | "smtp" | null {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  return null;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM || (process.env.SMTP_USER ? `ProPilot AI <${process.env.SMTP_USER}>` : "ProPilot AI <onboarding@resend.dev>");
}

export async function sendEmail(email: Email, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const to = [...new Set(email.to.filter((a) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)))];
  if (!to.length) return { sent: false, reason: "no recipients" };
  const provider = emailProvider();
  if (!provider) return { sent: false, reason: "email not configured" };

  if (provider === "resend") {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddress(), to, subject: email.subject, text: email.text, html: email.html, reply_to: email.replyTo }),
    });
    return res.ok ? { sent: true } : { sent: false, reason: `resend ${res.status}` };
  }

  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({ from: fromAddress(), to, subject: email.subject, text: email.text, html: email.html, replyTo: email.replyTo });
  return { sent: true };
}

export { esc } from "./email-escape";
