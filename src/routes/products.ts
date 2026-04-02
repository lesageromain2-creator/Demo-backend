import { Router } from "express";
import { db } from "../db/client.js";
import { products, sites } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

export const productsRouter = Router();

productsRouter.get("/:siteId", async (req, res) => {
  const { siteId } = req.params;
  const [site] = await db.select().from(sites).where(eq(sites.slug, siteId)).limit(1);
  if (!site) {
    return res.status(404).json({ error: "Unknown site" });
  }
  const list = await db
    .select()
    .from(products)
    .where(and(eq(products.siteId, site.id), eq(products.active, true)));
  return res.json(list);
});
