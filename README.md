# Backend multisites

API unique pour tous les frontends (Sites 1–50). Express + TypeScript + Drizzle ORM + Supabase (PostgreSQL).

## Routes

| Méthode | Route | Description |
|--------|--------|-------------|
| POST | `/api/contact` | Envoi formulaire contact (body: site_id, name, email, message, …) |
| POST | `/api/booking` | Création réservation (body: site_id, customer_*, date, time_slot, …) |
| GET | `/api/booking/:siteId` | Liste des réservations du site (slug) |
| GET | `/api/products/:siteId` | Catalogue produits du site |
| GET | `/api/menu/:siteId` | Menus + items du site |
| GET | `/api/events/:siteId` | Événements / spectacles / cours du site |
| GET | `/api/reviews/:siteId` | Avis du site |
| GET | `/health` | Health check |

Toutes les routes (sauf health) utilisent le **slug** du site (ex: `site-01-restaurant`, `supermarche-croix-rousse`). Les frontends envoient `site_id` (slug) dans le body ou l’URL.

## Setup

```bash
cp .env.example .env
# Remplir DATABASE_URL (Supabase)
npm install
npm run dev
```

## Variables d’environnement

Voir `.env.example`. Obligatoire : `DATABASE_URL`.
