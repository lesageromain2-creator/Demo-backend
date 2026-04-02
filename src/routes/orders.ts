import { Router } from "express";

export const ordersRouter = Router();

// Simulation endpoint: accepts order payload and returns a fake order id + ETA.
ordersRouter.post("/", async (req, res) => {
  const siteId = String(req.body?.site_id || "");
  if (!siteId) return res.status(400).json({ error: "Missing site_id" });

  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const now = Date.now();
  const orderId = `ord_${Math.random().toString(36).slice(2, 10)}_${now.toString(36)}`;

  // naive ETA: 35-75 minutes depending on item count
  const minutes = Math.min(75, 35 + items.length * 3);
  const eta = new Date(now + minutes * 60_000).toISOString();

  return res.json({
    ok: true,
    orderId,
    siteId,
    status: "accepted",
    eta,
  });
});

ordersRouter.get("/:orderId", async (req, res) => {
  const { orderId } = req.params;
  if (!orderId) return res.status(400).json({ error: "Missing orderId" });

  // demo state machine based on time
  const phases = ["received", "preparing", "on_the_way", "delivered"] as const;
  const idx = Math.floor((Date.now() / 1000) % phases.length);
  const status = phases[idx];

  return res.json({
    ok: true,
    orderId,
    status,
  });
});

