import { Router } from "express";
import { z } from "zod";
import { publicSettingsView, updateApiSettings, type ApiSettings } from "../settings.js";

export const settingsRouter = Router();

const updateSchema = z.object({
  googlePlacesApiKey: z.string().optional(),
  twilioAccountSid: z.string().optional(),
  twilioAuthToken: z.string().optional(),
  twilioSmsFrom: z.string().optional(),
  twilioWhatsappFrom: z.string().optional(),
  claudeApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
});

settingsRouter.get("/", (_req, res) => {
  res.json(publicSettingsView());
});

settingsRouter.put("/", (req, res) => {
  const body = updateSchema.parse(req.body);
  const patch: Partial<ApiSettings> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== "") patch[key as keyof ApiSettings] = value;
  }
  updateApiSettings(patch);
  res.json(publicSettingsView());
});
