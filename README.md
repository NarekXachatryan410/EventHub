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

Only Super Admins can use staff management: `GET/POST /api/users`, `PATCH /api/users/:id`, and `PATCH /api/users/:id/status`. Staff creation accepts Event Manager and Check-in Staff roles; further Super Admin accounts must be assigned by an existing Super Admin through a role update. Inactive accounts and stale role tokens are rejected on every protected request. Self-deactivation and removal of the last active Super Admin are blocked.

Event Managers and Super Admins can create, edit, publish, unpublish, cancel, complete, close registration, archive, and restore events. Closing registration or cancelling permanently deletes the event and its registrations, tickets, feedback, planning checklist, assignments, and related records. Cancellation email outbox entries are retained until delivery can complete. Archiving hides an event without deleting records. `PUT /api/events/:id/check-in-staff` assigns active Check-in Staff; those accounts can access only assigned events and their check-in workflows.

Attendee registration is available at `POST /api/events/:eventId/register`. It validates configured questions, serializes capacity checks with a PostgreSQL row lock, prevents duplicate normalized emails, creates hashed QR-ticket credentials, supports an optional waitlist, and writes confirmation and configured reminder emails to a durable outbox. Editing an event’s start time, reminder offsets, title, location, or slug synchronizes pending reminder schedules and encrypted event details. If Redis or Resend is unavailable after registration commits, the outbox retains pending messages for retry. Event cancellation queues notices before deleting event and attendee records; cancellation outbox entries remain retryable. Completing an event sends one follow-up to each checked-in attendee.

Staff can view registrations and export them as CSV at `GET /api/events/:eventId/registrations` and `/export`, or create one manually at `POST /api/events/:eventId/registrations/manual`. Attendees can cancel through the emailed link, which calls `PATCH /api/registrations/:registrationId/cancel`.

Ticket validation is available at `GET /api/tickets/:token`; the emailed ticket link opens a private QR ticket page. Assigned Check-in Staff, Event Managers, and Super Admins can scan or manually check in tickets and view the check-in list. Ticket tokens are stored as hashes and check-in is serialized to reject concurrent or replayed scans.

Checked-in attendees can submit feedback from the post-event email link at `POST /api/feedback`. Feedback tokens are random and stored as hashes. Event Managers and Super Admins can view individual feedback and aggregate statistics at `/api/events/:eventId/feedback` and `/feedback/analytics`, and download per-event CSV reports at `/api/events/:eventId/feedback/export`. The dashboards provide registration trends, attendance/no-show rates, event performance, and overall feedback ratings.

Event Managers and Super Admins can create graduation, guest-visit, partner-event, and custom planning checklists from `/dashboard/planning`. Checklist tasks support staff assignments, due dates, status tracking, and completion timestamps. Registration lists use cursor pagination and search across attendee names, email, and organization. Staff mutations are recorded in the Super Admin audit log; request bodies and attendee data are intentionally excluded.

CRM delivery is durable and retried from the database-backed sync log. Set `NAVIGATOR_API_URL` to a complete HTTPS-compatible upsert endpoint and `NAVIGATOR_API_KEY` to a bearer token. The generic adapter sends `POST` requests with an `Idempotency-Key` header and a JSON object containing `schemaVersion`, `source`, `upsertBy: "contact.email"`, `contact`, and `eventRegistration`. The endpoint must upsert contacts by normalized email and return JSON with a non-empty `contactId` and optional `leadId`. Registration status and check-in timestamps are included; EventHub treats someone as attended only when a check-in record exists. This is a documented adapter contract, not a claim that an unconfigured Navigator tenant has been connected. Super Admins can inspect and retry failures at `/dashboard/crm-sync`.

Email failures remain visible in `/dashboard/email-logs` and can be manually retried after Resend credentials are configured. Delivery, delay, bounce, complaint, suppression, and provider-failure updates are verified using Resend's signed webhook at `POST /api/webhooks/resend`; configure the webhook in Resend for the `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.suppressed`, and `email.failed` events, then set `RESEND_WEBHOOK_SECRET` to the signing secret Resend provides. The API preserves the raw request body for signature verification and acknowledges unknown event types without changing email logs. Login, public registration, feedback, and cancellation endpoints are rate limited. Production startup rejects placeholder secrets, missing Resend settings, and non-HTTPS frontend origins. Swagger documentation is available at `/api/docs`.

## Production Docker deployment

The regular `docker-compose.yml` remains the local development setup; its API service loads credentials from `apps/api/.env` (copy `.env.example` there and fill in the values). Production builds use `docker-compose.production.yml` and the production Dockerfiles; PostgreSQL and Redis are expected to be provisioned separately. Configure `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `EMAIL_ENCRYPTION_KEY`, `WEB_ORIGIN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, `NEXT_PUBLIC_API_URL`, and `NEXT_PUBLIC_SITE_URL` in the deployment environment. Use distinct high-entropy JWT and email-encryption secrets, terminate TLS at a trusted reverse proxy, and route the public frontend/API traffic to the Compose `web`/`api` services. The API container runs Prisma migrations before starting. GitHub Actions runs lint, tests, builds, and container builds on pushes and pull requests.

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
