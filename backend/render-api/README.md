# Render API

The API provides authenticated Topic Learning Chat and SQL Practice services.
Deploy with Node.js 22.5 or newer (the practice SQL engine uses Node's built-in
SQLite module). The API never executes learner SQL against Supabase or another
production database: each run seeds a fresh in-memory SQLite database from the
question's bounded sample tables, permits read-only statements, caps returned
rows, and closes the database after execution.

## Endpoints

- `GET /api/health` reports service availability.
- `POST /api/learning-chat` verifies the Supabase access token and requests a
  topic-grounded response from Groq.
- `POST /api/practice/generate` verifies the access token and asks Groq for
  exactly 1-10 validated questions matching the selected learning path,
  difficulty, and SQL question type.
- `POST /api/practice/execute` verifies the access token and executes a single
  read-only query against the isolated sample database included with a question.
- `POST /api/practice/evaluate` verifies the access token and sends the exact
  practice question, submitted SQL, real engine result, and recent conversation
  to Groq for learning feedback.

All protected endpoints require `Authorization: Bearer <Supabase access token>`.
The practice evaluator is separate from SQL execution; AI responses are never
used as query results.

## Configuration

Configure these variables in the Render service environment (never in Expo):

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (or the existing server-side `SUPABASE_SECRET_KEY`)
- `GROQ_API_KEY`
- `GROQ_MODEL` (optional; defaults to `openai/gpt-oss-120b`)

Without `GROQ_API_KEY`, generation and AI evaluation return `503`. There is no
mock question-generation or AI-evaluation fallback.

Apply all SQL migrations in `supabase/migrations` to the connected Supabase
project before using SQL Practice. The client saves sets, question drafts,
progress, execution attempts, bookmarks, and evaluator messages through
user-scoped Supabase tables protected by row-level security.

Run backend tests with `npm test` from this directory. Type-check with
`npx tsc --noEmit -p tsconfig.json`.
