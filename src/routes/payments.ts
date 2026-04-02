import { Router } from "express";

export const paymentsRouter = Router();

// Simulation endpoint: validates shape and returns a fake authorization.
paymentsRouter.post("/simulate", async (req, res) => {
  const siteId = String(req.body?.site_id || "");
  if (!siteId) return res.status(400).json({ error: "Missing site_id" });

  const amount = Number(req.body?.amount_eur ?? 0);
  const cardNumber = String(req.body?.cardNumber || "");

  // very naive “test cards”
  const ok =
    amount > 0 &&
    cardNumber.replace(/\s/g, "").length >= 12 &&
    !cardNumber.includes("0000");

  if (!ok) {
    return res.status(400).json({
      ok: false,
      siteId,
      status: "declined",
      reason: "payment_simulation_failed",
    });
  }

  return res.json({
    ok: true,
    siteId,
    status: "authorized",
    authId: `pay_${Math.random().toString(36).slice(2, 10)}`,
  });
});

