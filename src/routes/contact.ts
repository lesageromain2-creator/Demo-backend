import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { contacts, sites } from "../db/schema.js";
import { eq } from "drizzle-orm";

const bodySchema = z.object({
  site_id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(1),
});

export const contactRouter = Router();

contactRouter.post("/", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
  }
  const { site_id, name, email, phone, subject, message } = parsed.data;
  const [site] = await db.select().from(sites).where(eq(sites.slug, site_id)).limit(1);
  if (!site) {
    return res.status(400).json({ error: "Unknown site_id" });
  }
  await db.insert(contacts).values({
    siteId: site.id,
    name,
    email,
    phone: phone ?? null,
    subject: subject ?? null,
    message,
  });
  return res.status(201).json({ ok: true });
});
