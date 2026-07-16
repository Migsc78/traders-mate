export type ClientStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";
export type RouteDecision = "ROUTED" | "HELD";

// Whether a lead should be delivered now, or held pending payment.
export function routeDecision(status: ClientStatus): RouteDecision {
  return status === "ACTIVE" || status === "TRIAL" ? "ROUTED" : "HELD";
}

export interface EnquiryVars {
  name: string;
  phone: string;
  message?: string | null;
  business: string;
  town?: string | null;
  photos?: string[];
  postcode?: string | null;
  distanceMiles?: number | null;
}

// Default message templates. {{name}} {{phone}} {{message}} {{business}} {{town}}.
export const DEFAULT_TRADIE_NOTIFY =
  "New website enquiry:\n\n{{name}} — {{phone}}\n\n{{message}}\n\nCall them back or reply here.";
export const DEFAULT_CUSTOMER_ACK =
  "Thanks {{name}}, {{business}} has your message and will call you back shortly.";

export function renderTemplate(body: string, v: EnquiryVars): string {
  return body
    .replace(/{{\s*name\s*}}/g, v.name)
    .replace(/{{\s*phone\s*}}/g, v.phone)
    .replace(/{{\s*message\s*}}/g, (v.message && v.message.trim()) || "(no details given)")
    .replace(/{{\s*business\s*}}/g, v.business)
    .replace(/{{\s*town\s*}}/g, v.town || "");
}

// Full message sent to the tradie, with job location + any photo links appended.
export function buildTradieMessage(tpl: string | null | undefined, v: EnquiryVars): string {
  let body = renderTemplate(tpl || DEFAULT_TRADIE_NOTIFY, v);
  if (v.postcode) {
    const dist = v.distanceMiles != null ? ` — approx ${v.distanceMiles} mi from you` : "";
    body += `\n\nJob postcode: ${v.postcode}${dist}`;
  }
  if (v.photos && v.photos.length) body += `\n\nPhotos:\n${v.photos.join("\n")}`;
  return body;
}

export function buildCustomerAck(tpl: string | null | undefined, v: EnquiryVars): string {
  return renderTemplate(tpl || DEFAULT_CUSTOMER_ACK, v);
}
