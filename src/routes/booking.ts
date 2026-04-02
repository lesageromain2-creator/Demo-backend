import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { bookings, sites } from "../db/schema.js";
import { eq } from "drizzle-orm";

const bodySchema = z.object({
  site_id: z.string().min(1),
  customer_name: z.string().min(1),
  customer_email: z.string().email(),
  customer_phone: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_slot: z.string().optional(),
  party_size: z.number().int().min(1).optional(),
  type: z.string().optional(),
  notes: z.string().optional(),
});

export const bookingRouter = Router();

bookingRouter.post("/", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
  }
  const data = parsed.data;
  const [site] = await db.select().from(sites).where(eq(sites.slug, data.site_id)).limit(1);
  if (!site) {
    return res.status(400).json({ error: "Unknown site_id" });
  }
  await db.insert(bookings).values({
    siteId: site.id,
    customerName: data.customer_name,
    customerEmail: data.customer_email,
    customerPhone: data.customer_phone ?? null,
    date: data.date,
    timeSlot: data.time_slot ?? null,
    partySize: data.party_size ?? 1,
    type: data.type ?? "reservation",
    notes: data.notes ?? null,
  });
  return res.status(201).json({ ok: true });
});

bookingRouter.get("/:siteId", async (req, res) => {
  const { siteId } = req.params;
  const [site] = await db.select().from(sites).where(eq(sites.slug, siteId)).limit(1);
  if (!site) {
    return res.status(404).json({ error: "Unknown site" });
  }
  const list = await db.select().from(bookings).where(eq(bookings.siteId, site.id));
  return res.json(list);
});
