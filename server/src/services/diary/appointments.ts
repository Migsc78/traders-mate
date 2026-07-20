import { prisma } from "../../db.js";
import { ApiError } from "../../middleware/error.js";
import { sendMessage } from "../messaging/sender.js";
import { logMessage } from "../messaging/log.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function listAppointments(clientId: string, from: Date, to: Date) {
  return prisma.appointment.findMany({
    where: {
      clientId,
      startsAt: { gte: from, lt: to },
      status: { not: "CANCELLED" },
    },
    orderBy: { startsAt: "asc" },
    include: { enquiry: { select: { id: true, name: true, phone: true, postcode: true } } },
  });
}

export async function findClashes(clientId: string, startsAt: Date, endsAt: Date, excludeId?: string) {
  return prisma.appointment.findMany({
    where: {
      clientId,
      id: excludeId ? { not: excludeId } : undefined,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    take: 5,
  });
}

export async function createAppointment(opts: {
  clientId: string;
  enquiryId?: string | null;
  title: string;
  notes?: string | null;
  startsAt: Date;
  endsAt: Date;
  address?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  allowClash?: boolean;
}) {
  if (opts.endsAt <= opts.startsAt) throw new ApiError(400, "bad_range", "End must be after start");
  const clashes = await findClashes(opts.clientId, opts.startsAt, opts.endsAt);
  if (clashes.length && !opts.allowClash) {
    throw new ApiError(409, "clash", "This overlaps another booking", {
      clashes: clashes.map((c) => ({ id: c.id, title: c.title, startsAt: c.startsAt, endsAt: c.endsAt })),
    });
  }

  const appt = await prisma.appointment.create({
    data: {
      clientId: opts.clientId,
      enquiryId: opts.enquiryId || null,
      title: opts.title,
      notes: opts.notes || null,
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      address: opts.address || null,
      customerName: opts.customerName || null,
      customerPhone: opts.customerPhone || null,
      status: "SCHEDULED",
    },
  });

  const client = await prisma.client.findUnique({ where: { id: opts.clientId } });
  const phone = opts.customerPhone;
  if (phone && client) {
    const when = opts.startsAt.toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const confirmBody = `${client.businessName}: you're booked in for ${when}${opts.address ? ` at ${opts.address}` : ""}. Reply if you need to change.`;
    const results = await sendMessage({ to: phone, channel: "SMS", body: confirmBody });
    await logMessage({
      clientId: opts.clientId,
      enquiryId: opts.enquiryId,
      direction: "OUTBOUND",
      toAddr: phone,
      body: confirmBody,
      twilioSid: results[0]?.id,
    });

    const reminderAt = new Date(opts.startsAt.getTime() - DAY_MS);
    if (reminderAt > new Date()) {
      await prisma.followUp.create({
        data: {
          appointmentId: appt.id,
          clientId: opts.clientId,
          enquiryId: opts.enquiryId || null,
          kind: "APPT_REMINDER",
          runAt: reminderAt,
          status: "PENDING",
        },
      });
    }
  }

  return { appointment: appt, clashes };
}

export async function sendOnMyWay(clientId: string, appointmentId: string) {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, clientId },
    include: { client: true },
  });
  if (!appt) throw new ApiError(404, "not_found", "Appointment not found");
  if (!appt.customerPhone) throw new ApiError(400, "no_phone", "No customer phone on appointment");

  const body = `${appt.client.businessName}: I'm on my way${appt.address ? ` to ${appt.address}` : ""}. See you shortly.`;
  const results = await sendMessage({ to: appt.customerPhone, channel: "SMS", body });
  await logMessage({
    clientId,
    enquiryId: appt.enquiryId,
    direction: "OUTBOUND",
    toAddr: appt.customerPhone,
    body,
    twilioSid: results[0]?.id,
  });

  const updated = await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: "ON_THE_WAY" },
  });
  return { appointment: updated };
}
