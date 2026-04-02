import { Router } from "express";
import { db } from "../db/client.js";
import { reviews, sites } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const reviewsRouter = Router();

reviewsRouter.get("/:siteId", async (req, res) => {
  const { siteId } = req.params;
  const [site] = await db.select().from(sites).where(eq(sites.slug, siteId)).limit(1);
  if (!site) {
    return res.status(404).json({ error: "Unknown site" });
  }
  const list = await db
    .select()
    .from(reviews)
    .where(eq(reviews.siteId, site.id));
  return res.json(list);
});
