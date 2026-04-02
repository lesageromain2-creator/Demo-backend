/**
 * Schéma Drizzle — miroir de SUPABASE_SCHEMA.sql
 * Toutes les tables ont site_id pour isolation multi-sites
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  date,
  time,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

const created_at = () => timestamp("created_at", { withTimezone: true }).defaultNow();

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  ville: text("ville"),
  active: boolean("active").default(true),
  created_at: created_at(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    subject: text("subject"),
    message: text("message").notNull(),
    read: boolean("read").default(false),
    created_at: created_at(),
  },
  (t) => ({
    idxContactsSite: index("idx_contacts_site").on(t.siteId),
  })
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone"),
    date: date("date").notNull(),
    timeSlot: time("time_slot"),
    partySize: integer("party_size").default(1),
    type: text("type").default("reservation"),
    notes: text("notes"),
    status: text("status").default("pending"),
    stripeSessionId: text("stripe_session_id"),
    created_at: created_at(),
  },
  (t) => ({
    idxBookingsSite: index("idx_bookings_site").on(t.siteId),
    idxBookingsDate: index("idx_bookings_date").on(t.date),
  })
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    comparePrice: numeric("compare_price", { precision: 10, scale: 2 }),
    category: text("category"),
    subcategory: text("subcategory"),
    imageUrl: text("image_url"),
    cloudinaryId: text("cloudinary_id"),
    stock: integer("stock").default(-1),
    active: boolean("active").default(true),
    featured: boolean("featured").default(false),
    metadata: jsonb("metadata").default({}),
    created_at: created_at(),
  },
  (t) => ({
    idxProductsSite: index("idx_products_site").on(t.siteId),
    idxProductsActive: index("idx_products_active").on(t.siteId, t.active),
  })
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    customerEmail: text("customer_email").notNull(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    status: text("status").default("pending"),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
    stripeSessionId: text("stripe_session_id").unique(),
    stripePaymentIntent: text("stripe_payment_intent"),
    shippingAddress: jsonb("shipping_address"),
    notes: text("notes"),
    created_at: created_at(),
  },
  (t) => ({
    idxOrdersSite: index("idx_orders_site").on(t.siteId),
  })
);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  metadata: jsonb("metadata").default({}),
});

export const menus = pgTable("menus", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").default(true),
  sortOrder: integer("sort_order").default(0),
  created_at: created_at(),
});

export const menuItems = pgTable("menu_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  menuId: uuid("menu_id").notNull().references(() => menus.id, { onDelete: "cascade" }),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }),
  category: text("category"),
  allergens: text("allergens").array(),
  imageUrl: text("image_url"),
  available: boolean("available").default(true),
  sortOrder: integer("sort_order").default(0),
});

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug"),
    description: text("description"),
    date: date("date").notNull(),
    timeStart: time("time_start"),
    timeEnd: time("time_end"),
    location: text("location"),
    capacity: integer("capacity"),
    price: numeric("price", { precision: 10, scale: 2 }).default("0"),
    imageUrl: text("image_url"),
    type: text("type").default("event"),
    status: text("status").default("published"),
    metadata: jsonb("metadata").default({}),
    created_at: created_at(),
  },
  (t) => ({
    idxEventsSite: index("idx_events_site").on(t.siteId),
    idxEventsDate: index("idx_events_date").on(t.date),
  })
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    authorTitle: text("author_title"),
    rating: integer("rating"),
    content: text("content").notNull(),
    source: text("source").default("manual"),
    featured: boolean("featured").default(false),
    approved: boolean("approved").default(true),
    created_at: created_at(),
  },
  (t) => ({
    idxReviewsSite: index("idx_reviews_site").on(t.siteId),
  })
);

export const subscribers = pgTable("subscribers", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  active: boolean("active").default(true),
  created_at: created_at(),
});

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    excerpt: text("excerpt"),
    content: text("content"),
    imageUrl: text("image_url"),
    published: boolean("published").default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    created_at: created_at(),
  },
  (t) => ({
    idxPostsSite: index("idx_posts_site").on(t.siteId),
  })
);

