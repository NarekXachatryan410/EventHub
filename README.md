# EventHub

EventHub is an Academy event management platform. This repository is an npm-workspaces monorepo with a Next.js frontend and a NestJS API.

## Stack

- Next.js, TypeScript, Tailwind CSS, and shadcn/ui
- NestJS, Prisma, and PostgreSQL
- Redis for background-job infrastructure
- Jest and Supertest for API tests
- Docker Compose for local services

## Run locally with Docker

Requirements: Docker Desktop (or Docker Engine with Compose) and Node.js 22 or newer.

```sh
cp .env.example .env
docker compose up --build
```

Compose starts PostgreSQL with the database named `eventhub`, Redis, the API, and the web app. The API applies checked-in Prisma migrations on startup.
The Prisma schema includes users, events, registrations, tickets, check-ins, email logs, email templates, CRM synchronization logs, and feedback. Registration writes normalize email addresses; passwords, QR ticket tokens, and self-cancellation tokens are stored as hashes.

- Web app: http://localhost:3000
- API health: http://localhost:4000/api/health
- Swagger: http://localhost:4000/api/docs
- PostgreSQL: `localhost:5433` (`eventhub` / local development credentials in `docker-compose.yml`)
- Redis: `localhost:6379`

The database and Redis data are stored in named Docker volumes. Stop the services with `docker compose down`; this keeps the data.

## Current API coverage

The API uses the `/api` prefix. Public event pages are available at `GET /api/events` and `GET /api/events/:slug`. Staff sign in at `/login`; successful authentication uses the API's HTTP-only JWT cookie and opens the protected `/dashboard` workspace. Tokens are not stored in browser storage. Seed the first Super Admin with `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in `apps/api/.env`, then run `npm run db:seed --workspace=api`.

Only Super Admins can use staff management: `GET/POST /api/users`, `PATCH /api/users/:id`, and `PATCH /api/users/:id/status`. Staff creation accepts Event Manager and Check-in Staff roles; further Super Admin accounts must be assigned by an existing Super Admin through a role update. Inactive accounts and stale role tokens are rejected on every protected request. The schema migration adds an active flag defaulted to `true`, preserving existing staff access; self-deactivation and removal of the last active Super Admin are blocked.

Attendee registration is available at `POST /api/events/:eventId/register`. It validates configured questions, serializes capacity checks with a PostgreSQL row lock, prevents duplicate normalized emails, creates hashed QR-ticket credentials, supports an optional waitlist, and writes confirmation email jobs to a durable outbox. If Redis or Resend is unavailable after the registration commits, the outbox retains the email for retry.

Staff can view registrations and export them as CSV at `GET /api/events/:eventId/registrations` and `/export`, or create one manually at `POST /api/events/:eventId/registrations/manual`. Attendees cancel with `PATCH /api/registrations/:registrationId/cancel` and the cancellation token delivered in the email.

Ticket validation is available at `GET /api/tickets/:token`. Assigned check-in staff and event managers can check in a ticket with `POST /api/events/:eventId/check-in`, perform a manual check-in with `/check-ins/manual`, and view the check-in list at `GET /api/events/:eventId/check-ins`. The backend stores only a hash of the QR token and rejects replayed check-ins.

Attendees can submit feedback at `POST /api/feedback` using their ticket token after check-in and event completion. Event managers can view individual feedback and aggregate statistics at `/api/events/:eventId/feedback` and `/feedback/analytics`.

The specialized planning/checklist workflows, full staff dashboard, live Navigator CRM client, and Cloudinary upload endpoints are not implemented yet. Navigator synchronization must use the official API contract and credentials; do not treat registrations as attended until check-in.

## Run apps outside Docker

```sh
npm install
cp .env.example apps/api/.env
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
npm run db:seed --workspace=api
npm run dev:api
```

In another terminal, run `npm run dev`. The frontend starts on port 3000 and the API on port 4000.

## Common commands

```sh
npm run build
npm run lint
npm test
npm run test:e2e
npm run db:studio
```

The local database credentials are for development only. Replace them and configure secrets securely before deploying.