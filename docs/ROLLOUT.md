# Rollout

Deployment, verification, rollback and deploy-cleanup procedures for this site are in the team's
private operator documentation.

In short: changes are checked on a deploy preview before production, production and previews use
separate prompt-pack channels, and the security checks in `docs/SECURITY.md` are verified after each
release.
