/**
 * Quick runtime check for Twilio signature helper (dev).
 * Run: npx tsx src/__tests__/twilioSignature.test.ts
 */
import { createHmac } from "node:crypto";
import { twilioSignatureValid } from "../middleware/twilioSignature.js";

const token = "test_auth_token_1234567890";
const url = "https://example.com/api/twilio/voice/missed";
const params = { From: "+447700900123", To: "+447700900999", CallSid: "CAtest" };

let data = url;
for (const key of Object.keys(params).sort()) {
  data += key + params[key as keyof typeof params];
}
const goodSig = createHmac("sha1", token).update(Buffer.from(data, "utf8")).digest("base64");

const ok = twilioSignatureValid({ authToken: token, signature: goodSig, url, params });
const bad = twilioSignatureValid({ authToken: token, signature: "AAAA", url, params });

if (!ok) {
  console.error("FAIL: valid signature rejected");
  process.exit(1);
}
if (bad) {
  console.error("FAIL: invalid signature accepted");
  process.exit(1);
}
console.log("OK: twilio signature validation");
