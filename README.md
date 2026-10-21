# Prepflow

React + Express + MongoDB interview-practice tracker.

## Setup

1. Copy `.env.example` to `.env` and set `MONGODB_URI` (or the supported legacy `mongodb` key) and a long random `JWT_SECRET`.
2. Run `npm install` in the root, then `npm run install:all`.
3. Start the app with `npm run dev`.
4. Open `http://localhost:5000`.

Express serves the built React application and its API from one origin and one port. User passwords are hashed with bcrypt, progress is stored per user in MongoDB, and logging out revokes the active JWT session.

## Production

Run `npm run start` to build React and serve it from Express on `http://localhost:5000`. This provides one deployable MERN service: React is the client, Express is the API, and MongoDB stores user accounts and progress.

## MongoDB Atlas DNS troubleshooting

If your local DNS resolver refuses the `mongodb+srv` record, add `DNS_SERVERS=1.1.1.1,8.8.8.8` to `.env` and restart the API. This only changes the resolver used for the SRV lookup; it does not bypass Atlas access controls or credentials.

## Production setup

Set these environment variables in Vercel Project Settings → Environment Variables for each deployment environment you use (do not commit `.env`):

- `MONGODB_URI`: production MongoDB connection string.
- `JWT_SECRET`: a random secret of at least 32 characters.
- `APP_URL`: canonical HTTPS URL, without a trailing slash. Vercel's `VERCEL_URL` is used as a fallback.
- `CLIENT_ORIGIN`: allowed browser origin(s), comma-separated, without trailing slashes. Vercel's deployment and production domains are also trusted automatically.
- `RESEND_API_KEY` and `EMAIL_FROM`: Resend key and a sender on a verified domain. These are required for signup verification and password reset, but missing email configuration does not prevent existing users from logging in.
- `ERROR_WEBHOOK_URL` and optionally `ERROR_WEBHOOK_TOKEN`: HTTPS endpoint for structured error events.

Production startup requires the database connection and session secret. Configure the email settings before allowing new signups. In local development, verification and reset URLs are printed in the API log. Existing accounts stay verified; new accounts must verify their email. Sessions use an HttpOnly, SameSite cookie. Old local-storage sessions are migrated to the cookie on their next successful login restore.

The API exposes `/api/health/live` for process liveness and `/api/health/ready` for database readiness. Configure the hosting platform to use readiness before routing traffic. The built-in rate limits are per process; deployments with multiple instances should enforce shared limits at the edge or configure a shared rate-limit store. Configure MongoDB automated backups/PITR with your provider and perform a restore drill before launch. Set an error webhook or connect your monitoring provider, and alert on failed readiness checks and elevated 5xx rates.

LeetCode stats are cached for five minutes and the last successful snapshot is shown if LeetCode is down. Per-question matching is limited to the recent accepted submissions made public by LeetCode; it is not a complete solve-history import. Prepflow never requests or stores a LeetCode password or session.

Account settings provide a JSON data export and password-confirmed account deletion. Review the privacy notice, publish your final privacy policy/terms for your jurisdiction, set a retention policy for operational logs, and verify your email sender before opening registration publicly.

## Checks

Run `npm test` for server/security smoke tests and `npm run build` for the production client build. CI runs these checks for pushes and pull requests.

# prepflow
