# Security overview

- **Sign-in:** the password is checked on the server and never returned. The browser holds a signed,
  expiring session in an HttpOnly, Secure, SameSite=Strict cookie, plus a CSRF value kept in memory.
  Sign-out revokes the session on the server, and all sessions can be ended at once.
- **Every request:** each protected function authorises the request before parsing it, reading other
  storage or calling the model, and fails closed.
- **Jobs:** exactly one submission owns a job, and only that session can read the result.
- **Limits:** login attempts are throttled and generation is rate-limited; both fail closed.
- **Instructions:** the article instructions are in a private, signed prompt pack on the server
  (`docs/PROMPT-PACK.md`), never in the browser or this repository.
- **Output:** provider errors are classified and article HTML is sanitised on the server.
- **Static site:** only the browser files in `public/` are published; source, tests and docs are not
  served.
- **Secrets:** API keys, signing keys and passwords are server-side settings, not committed.

Detailed procedures and settings are in the team's private operator documentation.
