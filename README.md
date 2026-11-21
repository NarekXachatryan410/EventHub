# EventHub

EventHub is an event management SaaS monorepo. `apps/web` is the Next.js application and `apps/api` is the NestJS API. PostgreSQL is accessed through Prisma; Redis backs BullMQ email delivery and distributed API rate limits.

## Stack and architecture

- Node.js 22+, npm workspaces, TypeScript
- Next.js 16, React 19, Tailwind CSS and shadcn/ui components
- NestJS 12, Prisma 6, PostgreSQL
- Redis, BullMQ, Resend, Jest and Supertest
- Docker Compose for local PostgreSQL/Redis and containerized apps

The API is mounted under `/api`. It owns staff authentication and authorization, event and registration workflows, ticket/QR validation, CRM, planning, analytics, audit logs, email templates, an encrypted email outbox, and Resend webhooks. The browser uses an HTTP-only JWT cookie; it does not store the session token in local storage. Protected API writes validate the request `Origin` against `WEB_ORIGIN` when browsers supply that header.

## Features

- Public event discovery, event registration, configured questions, capacity limits, optional waitlists, cancellation links, ticket QR codes, check-in, and feedback.
- Staff roles: Super Admin, Event Manager, and Check-in Staff. Super Admins can manage all organizers; Event Managers are restricted to events, registrations, analytics, CRM customers, and email records for their own organizer account; Check-in Staff can use only events assigned to them and cannot access CRM.
- CRM customers are organizer-scoped and deduplicated by normalized email. The CRM includes customer profiles and registration/attendance history, paginated customer and timeline APIs, notes, organizer-specific tags, saved database-backed segments, reminders, activity records, and dashboard counts.
- Event planning checklists and templates, staff audit logs, registration and attendance analytics, feedback reporting, and CSV exports.
- Email confirmation with ticket QR attachment, waitlist/cancellation/reminder/follow-up email workflows, retryable outbox processing, delivery status tracking, and email logs. A queued email is not reported as delivered until Resend confirms delivery by webhook.

## Environment configuration

Start with `.env.example`. It contains local-only URLs and placeholders, not working production credentials. The file documents each variable and the production requirements. For local development, copy it both to the repository root (Compose interpolation) and to `apps/api/.env` (NestJS and Prisma):

```sh
cp .env.example .env
cp .env.example apps/api/.env
```

Important variables:

| Variable | Purpose | Production requirement |
| --- | --- | --- |
| `DATABASE_URL` | Prisma runtime PostgreSQL connection | Required; a pooled URL is supported |
| `DIRECT_URL` | Prisma direct connection used by migrations | Required; use the provider's direct/non-pooled connection when runtime is pooled |
| `REDIS_URL` | BullMQ queues and distributed throttling | Required; use `rediss://` when Redis requires TLS |
| `JWT_SECRET` | Signs staff session JWTs | Unique deployment secret, at least 32 characters |
| `EMAIL_ENCRYPTION_KEY` | Encrypts queued email payloads containing attendee details and ticket links | Separate unique deployment secret, at least 32 characters; retain it to decrypt pending outbox messages |
| `WEB_ORIGIN` | Credentialed CORS and browser write-origin validation | Exact HTTPS frontend origin, without path |
| `RESEND_API_KEY` | Resend email API authentication | Required for email sending |
| `RESEND_FROM_EMAIL` | Message sender | Address on a Resend-verified domain; `resend.dev` cannot send to arbitrary attendees |
| `RESEND_WEBHOOK_SECRET` | Verifies Resend delivery webhooks | Required to record provider delivery statuses |
| `NEXT_PUBLIC_API_URL` | Browser-visible API base URL; embedded into the web build | Required for production frontend build |
| `NEXT_PUBLIC_SITE_URL` | Public website URL used for links and metadata | Required for the production web build |
| `API_INTERNAL_URL` | Server-side web-to-API URL | Set to the private API service URL in production; Compose uses `http://api:4000` |
| `PORT` | API listen port (defaults to 4000) | Set to the platform-assigned port if required |
| `TRUST_PROXY` | Express trusted proxy hops/range for client IP handling and rate limits | Match the actual reverse-proxy topology; production Compose defaults to one hop |
| `NODE_ENV` | Runtime environment; enables strict production checks and secure cookies | Set to `production` in the API deployment |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Input to the initial Super Admin seed | Needed only when running the seed; do not expose through public config |

There is no configured upload integration or Navigator dependency. No third-party CRM credentials are required.

## Run locally

Requirements: Docker with Compose and Node.js 22 or newer.

```sh
cp .env.example .env
cp .env.example apps/api/.env
docker compose up --build
```

Compose starts PostgreSQL, Redis, the API, and the web app. The API applies checked-in migrations at startup. Local endpoints:

- Web: <http://localhost:3000>
- API health: <http://localhost:4000/api/health>
- Swagger: <http://localhost:4000/api/docs>
- PostgreSQL: `localhost:5433` (local-only Compose credentials)
- Redis: `localhost:6379`

To run the app processes on the host instead, keep PostgreSQL and Redis in Compose and use the API connection URLs in `apps/api/.env`:

```sh
npm ci
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
npm run dev:api
```

In a second terminal, run `npm run dev` for the web app. The local seed requires `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in `apps/api/.env`:

```sh
npm run db:seed --workspace=api
```

## Database and migrations

The Prisma schema is `apps/api/prisma/schema.prisma`; forward-only migration SQL is in `apps/api/prisma/migrations`. Use `npm run db:migrate` only for a local development database. `npm run db:migrate:deploy --workspace=api` applies checked-in migrations to a configured deployment database. Do not point development migration commands at production. `DIRECT_URL` exists so Prisma migrations can connect directly even if `DATABASE_URL` uses a provider's pooler.

The migration history includes the earlier CRM removal and a later EventHub-owned CRM foundation. Prisma applies these migrations in timestamp order on a new database. The current schema is the source of truth for the final models.

## Email delivery setup

For attendee delivery, add and verify your sending domain in Resend, publish the DNS records Resend supplies, and set `RESEND_FROM_EMAIL` to an address on that domain (for example, `EventHub <tickets@your-verified-domain.com>`). Configure the Resend webhook at `POST /api/webhooks/resend` for `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.suppressed`, and `email.failed`, then set `RESEND_WEBHOOK_SECRET` to its signing secret. Login, registration, feedback, cancellation, and general API requests are rate limited. Email logs show provider outcomes and allow failed messages to be retried by an authorized organizer.

## Commands and checks

Run from the repository root:

```sh
npm run dev
npm run dev:api
npm run build
npm run lint
npm test
npm run test:e2e
npm run db:generate
npm run db:migrate
npm run db:studio
```

API Jest unit tests live in `apps/api/src/**/*.spec.ts`; Supertest E2E tests live in `apps/api/test`. There is no separate configured frontend test runner; frontend quality checks are ESLint and the Next.js production build.

## Production deployment

`docker-compose.production.yml` builds `apps/api/Dockerfile.production` and `apps/web/Dockerfile.production`. Provision PostgreSQL and Redis separately, then configure the production variables in the table above. `DIRECT_URL` must be supplied to the API container because its startup command applies Prisma migrations before starting NestJS. The web image embeds `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SITE_URL` at build time and reads `API_INTERNAL_URL` at runtime.

Terminate HTTPS at a trusted reverse proxy, configure `TRUST_PROXY` to match that topology, route the public frontend and API hostnames to the web/API services, and set `WEB_ORIGIN` to the exact frontend origin. Verify health checks at `/api/health` and `/`. Configure the Resend webhook and verify sender-domain DNS before relying on delivery. GitHub Actions runs lint, API tests, builds, and container builds on pushes and pull requests.

The repository does not include production credentials or provision infrastructure. Review and apply migrations through your deployment process; this README does not imply that a deployment or production database was tested.
