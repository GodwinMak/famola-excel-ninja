# Famola Excel Ninja

Enterprise Purchase Order, Invoicing, Delivery Note, and Payment reconciliation system with 3-way matching, customer number-series books, and full disaster-recovery backups.

The app is split into two independent projects:

- **`backend/`** — Express API backed by MySQL (via Sequelize), with JWT authentication and server-enforced role-based access control.
- **`frontend/`** — Vite + React app.

## Prerequisites

- Node.js 20+
- A MySQL (or MariaDB) server

## First-time setup

1. Create a database and user for the app, e.g.:
   ```sql
   CREATE DATABASE famola_erp;
   CREATE USER 'famola_app'@'localhost' IDENTIFIED BY 'changeme';
   GRANT ALL PRIVILEGES ON famola_erp.* TO 'famola_app'@'localhost';
   ```
2. Copy the env files and fill in your DB credentials / secrets:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```
3. Install dependencies and run migrations + seed the first admin user:
   ```bash
   npm run install:all
   npm run migrate
   npm run seed
   ```
   The seeded admin's email/password come from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `backend/.env` — change the password after first login.

## Run locally

```bash
npm run dev
```

This starts the backend on `http://localhost:4000` and the frontend dev server on `http://localhost:5173` (which proxies `/api` requests to the backend). Open `http://localhost:5173`.

## Running each side independently

```bash
npm run dev:backend   # backend/ — tsx watch, http://localhost:4000
npm run dev:frontend  # frontend/ — vite, http://localhost:5173
```

## Production build

```bash
npm run build:backend   # compiles backend/ to backend/dist
npm run build:frontend  # builds frontend/ to frontend/dist (static assets)
```

Serve `frontend/dist` from any static host or reverse proxy, pointing `/api` at the running backend.

The frontend uses client-side routing (react-router-dom), so every screen has a real
URL (`/invoices`, `/po`, `/settings`, etc.). Your static host or reverse proxy must be
configured with an SPA fallback — rewrite any unmatched path to `/index.html` — or a
direct visit/refresh on a non-root route will 404. `vite dev`/`vite preview` already do
this automatically; it only matters for production hosts like nginx/Apache/S3 (e.g.
nginx: `try_files $uri /index.html;`).
