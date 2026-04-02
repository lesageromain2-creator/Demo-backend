import "dotenv/config";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { contactRouter } from "./routes/contact.js";
import { bookingRouter } from "./routes/booking.js";
import { productsRouter } from "./routes/products.js";
import { menuRouter } from "./routes/menu.js";
import { eventsRouter } from "./routes/events.js";
import { reviewsRouter } from "./routes/reviews.js";
import { ordersRouter } from "./routes/orders.js";
import { deliveryRouter } from "./routes/delivery.js";
import { paymentsRouter } from "./routes/payments.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use("/api/contact", contactRouter);
app.use("/api/booking", bookingRouter);
app.use("/api/products", productsRouter);
app.use("/api/menu", menuRouter);
app.use("/api/events", eventsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/delivery", deliveryRouter);
app.use("/api/payments", paymentsRouter);

app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.listen(config.port, () => {
  console.log(`Backend multisites listening on port ${config.port}`);
});
