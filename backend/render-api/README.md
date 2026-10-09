# Render API

The API provides authenticated Topic Learning Chat and SQL Practice services.
Deploy with Node.js 22.5 or newer (the practice SQL engine uses Node's built-in
SQLite module). The API never executes learner SQL against Supabase or another production
database: each run seeds a fresh in-memory SQLite database from the question's
bounded sample tables, permits single-statement reads and data changes only to
those tables, caps returned rows, reports affected-row counts, and closes the
database after execution. Schema changes, attached databases, and unapproved
SQLite functions remain blocked by a distinct SQL policy error.

## Endpoints

- `GET /api/health` reports service availability.
- `POST /api/learning-chat` verifies the Supabase access token and requests a
  topic-grounded response from Gemini.
- `POST /api/practice/generate` verifies the access token and asks Gemini for
  exactly 1-10 validated questions matching the selected learning path,
  difficulty, and SQL question type.
- `POST /api/practice/execute` verifies the access token and executes a single
  SQL statement against the isolated sample database included with a question.
- `POST /api/practice/evaluate` verifies the access token and sends the exact
  practice question, submitted SQL, real engine result, and recent conversation
  to Gemini for independent semantic evaluation and learning feedback. A
  successful SQLite execution is not treated as proof that the answer is
  correct; malformed evaluator responses and provider failures are returned as
  errors, never as successful verdicts.

All protected endpoints require `Authorization: Bearer <Supabase access token>`.
The practice evaluator is separate from SQL execution; AI responses are never
used as query results.

## Configuration

Configure these variables in the Render service environment (never in Expo):

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (or the existing server-side `SUPABASE_SECRET_KEY`)
- `GEMINI_API_KEY` for backend AI features
- `GEMINI_MODEL` (optional; defaults to `gemini-3.5-flash-lite`)

Without `GEMINI_API_KEY`, AI endpoints return `503`. Gemini is the only active
AI provider; credentials are never configured in Expo or other frontend
environments.

Apply all SQL migrations in `supabase/migrations` to the connected Supabase
project before using SQL Practice. The client saves sets, question drafts,
progress, execution attempts, bookmarks, and evaluator messages through
user-scoped Supabase tables protected by row-level security.

Run backend tests with `npm test` from this directory. Type-check with
`npx tsc --noEmit -p tsconfig.json`.
