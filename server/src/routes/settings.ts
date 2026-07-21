import { Router } from "express";
import { z } from "zod";
import { publicSettingsView, updateApiSettings, type ApiSettings } from "../settings.js";
import {
  APP_CONFIG_KEYS,
  getTwilioUkAddressSid,
  getTwilioUkBundleSid,
  setConfig,
} from "../services/appConfig.js";

export const settingsRouter = Router();

const updateSchema = z.object({
  googlePlacesApiKey: z.string().optional(),
  twilioAccountSid: z.string().optional(),
  twilioAuthToken: z.string().optional(),
  twilioSmsFrom: z.string().optional(),
  twilioWhatsappFrom: z.string().optional(),
  twilioUkBundleSid: z.string().optional(),
  twilioUkAddressSid: z.string().optional(),
  claudeApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  missedCallSayVoice: z.string().optional(),
  missedCallSayText: z.string().optional(),
  missedCallSmsText: z.string().optional(),
});

settingsRouter.get("/", async (_req, res, next) => {
  try {
    const bundle = await getTwilioUkBundleSid();
    const address = await getTwilioUkAddressSid();
    res.json({
      ...publicSettingsView(),
      twilioUkBundleSid: {
        configured: !!bundle,
        hint: bundle ? `…${bundle.slice(-6)}` : null,
      },
      twilioUkAddressSid: {
        configured: !!address,
        hint: address ? `…${address.slice(-6)}` : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

settingsRouter.put("/", async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const patch: Partial<ApiSettings> = {};
    for (const [key, value] of Object.entries(body)) {
      if (key === "twilioUkBundleSid" || key === "twilioUkAddressSid") continue;
      if (value !== undefined && value !== "") patch[key as keyof ApiSettings] = value;
    }
    if (Object.keys(patch).length) updateApiSettings(patch);

    if (body.twilioUkBundleSid?.trim()) {
      await setConfig(APP_CONFIG_KEYS.ukBundleSid, body.twilioUkBundleSid.trim());
    }
    if (body.twilioUkAddressSid?.trim()) {
      await setConfig(APP_CONFIG_KEYS.ukAddressSid, body.twilioUkAddressSid.trim());
    }

    const bundle = await getTwilioUkBundleSid();
    const address = await getTwilioUkAddressSid();
    res.json({
      ...publicSettingsView(),
      twilioUkBundleSid: {
        configured: !!bundle,
        hint: bundle ? `…${bundle.slice(-6)}` : null,
      },
      twilioUkAddressSid: {
        configured: !!address,
        hint: address ? `…${address.slice(-6)}` : null,
      },
    });
  } catch (err) {
    next(err);
  }
});
