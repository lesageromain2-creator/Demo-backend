import { Router } from "express";
import { db } from "../db/client.js";
import { menus, menuItems, sites } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const menuRouter = Router();

menuRouter.get("/:siteId", async (req, res) => {
  const { siteId } = req.params;
  const [site] = await db.select().from(sites).where(eq(sites.slug, siteId)).limit(1);
  if (!site) {
    return res.status(404).json({ error: "Unknown site" });
  }
  const menuList = await db.select().from(menus).where(eq(menus.siteId, site.id));
  const result = await Promise.all(
    menuList.map(async (menu) => {
      const items = await db
        .select()
        .from(menuItems)
        .where(eq(menuItems.menuId, menu.id));
      return { ...menu, items };
    })
  );
  return res.json(result);
});
