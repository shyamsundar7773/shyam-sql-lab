# Render API

The learning chat endpoint is `POST /api/learning-chat`. It verifies the
Supabase access token with Supabase Auth before creating a response. Learning
conversations and messages remain client-written through Supabase with the
ownership policies in `supabase/migrations/20261002210000_topic_learning_chat.sql`.

Configure these variables in the Render service environment (never in Expo):

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (or the existing server-side `SUPABASE_SECRET_KEY`)
- `GROQ_API_KEY` (optional until AI replies are enabled)
- `GROQ_MODEL` (optional; defaults to `openai/gpt-oss-120b`)

The Render API calls Groq's OpenAI-compatible Chat Completions endpoint. Keep
`GROQ_API_KEY` in Render's server-side environment only; never set it in Expo
or an `EXPO_PUBLIC_*` variable.

Without `GROQ_API_KEY`, the endpoint returns `503`; it never substitutes a
mocked or development AI response. The client sends only the current topic, its
official learning content, recent conversation messages, and the signed-in
user's access token.

Apply the Supabase migration before using topic conversations.

Run the backend route integration tests with `npm test` from this directory.
