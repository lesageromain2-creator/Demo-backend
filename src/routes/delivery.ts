import { Router } from "express";

export const deliveryRouter = Router();

// Simulation endpoint: returns an ETA window and fee estimate.
deliveryRouter.post("/estimate", async (req, res) => {
  const siteId = String(req.body?.site_id || "");
  if (!siteId) return res.status(400).json({ error: "Missing site_id" });

  const distanceKm = Number(req.body?.distance_km ?? 3);
  const itemCount = Array.isArray(req.body?.items) ? req.body.items.length : Number(req.body?.item_count ?? 8);

  const prepMin = Math.min(35, 12 + Math.ceil(itemCount / 3));
  const travelMin = Math.min(35, 8 + Math.ceil(Math.max(0, distanceKm) * 4));
  const min = prepMin + travelMin;
  const max = min + 15;

  const fee = Math.max(0, Math.round((2.5 + Math.max(0, distanceKm) * 0.6) * 100) / 100);

  return res.json({
    ok: true,
    siteId,
    etaMinutes: { min, max },
    feeEUR: fee,
  });
});

