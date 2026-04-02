import { Router } from "express";
import { db } from "../db/client.js";
import { events, sites } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const eventsRouter = Router();

eventsRouter.get("/:siteId", async (req, res) => {
  const { siteId } = req.params;
  const [site] = await db.select().from(sites).where(eq(sites.slug, siteId)).limit(1);
  if (!site) {
    return res.status(404).json({ error: "Unknown site" });
  }
  const list = await db
    .select()
    .from(events)
    .where(eq(events.siteId, site.id));
  return res.json(list);
});
