import "server-only";
import sgMail from "@sendgrid/mail";
import { EMAIL_FROM, EMAIL_FROM_NAME } from "@/lib/site";

// Configure once at module load. When SENDGRID_API_KEY is unset (local dev,
// preview, or before the integration is provisioned) every send becomes a
// logged no-op — exactly like the R2 upload path — so notifications never
// break the action that triggers them.
const API_KEY = process.env.SENDGRID_API_KEY;
if (API_KEY) sgMail.setApiKey(API_KEY);

// Sandbox mode validates the request with SendGrid without delivering — set
// SENDGRID_SANDBOX=1 to smoke-test the wiring against a real key safely.
const SANDBOX = process.env.SENDGRID_SANDBOX === "1";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** SendGrid category for analytics segmentation, e.g. "order", "offer". */
  category?: string;
  /** Correlation metadata surfaced in delivery webhooks (strings only). */
  args?: Record<string, string>;
  /** One-click unsubscribe target; adds RFC-8058 List-Unsubscribe headers. */
  unsubscribeUrl?: string;
  replyTo?: string;
};

/** Very small HTML→text fallback so every email has a plaintext part. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    // Decode every entity escapeHtml() emits, not just &amp; — otherwise an
    // item titled `Peace <3` reached the plaintext part as `Peace &lt;3`.
    // &amp; must come last so "&amp;lt;" doesn't decode into a stray "<".
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Send one transactional email. Returns a small status object and never
 * throws — callers fire-and-forget, so a provider hiccup must not surface as
 * a 500 on the order/offer/message that spawned it.
 */
export async function sendEmail(input: SendEmailInput): Promise<{
  ok: boolean;
  skipped?: boolean;
  statusCode?: number;
}> {
  if (!API_KEY) {
    console.info(
      `[email] skipped (SENDGRID_API_KEY unset): "${input.subject}" → ${input.to}`,
    );
    return { ok: true, skipped: true };
  }

  // RFC 2369 URL-form List-Unsubscribe. We intentionally omit the RFC 8058
  // "List-Unsubscribe-Post: One-Click" header because the target is a GET
  // manage page (not a POST endpoint) — clients will open it in a browser.
  const headers = input.unsubscribeUrl
    ? { "List-Unsubscribe": `<${input.unsubscribeUrl}>` }
    : undefined;

  try {
    const [res] = await sgMail.send({
      to: input.to,
      from: { email: EMAIL_FROM, name: EMAIL_FROM_NAME },
      replyTo: input.replyTo,
      subject: input.subject,
      html: input.html,
      text: input.text ?? htmlToText(input.html),
      categories: input.category ? [input.category] : undefined,
      customArgs: input.args,
      headers,
      // Clean links (no click-tracking rewrite) keep our URLs trustworthy.
      trackingSettings: { clickTracking: { enable: false, enableText: false } },
      mailSettings: SANDBOX ? { sandboxMode: { enable: true } } : undefined,
    });
    return { ok: true, statusCode: res.statusCode };
  } catch (err: unknown) {
    const body =
      (err as { response?: { body?: unknown } })?.response?.body ?? err;
    console.error(
      `[email] send failed: "${input.subject}" → ${input.to}`,
      body,
    );
    return { ok: false };
  }
}
