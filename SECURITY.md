# Security policy

Tangent is in limited alpha and has no supported releases yet. Security reports are still welcome, especially about authentication, invites, workspace separation and the client guest view.

## Reporting a vulnerability

Please do not open a public issue for security problems. Report privately through the repository's **Security** tab ("Report a vulnerability").

Include what you found, how to reproduce it, and the version or commit you tested. You will get a reply as soon as practical. This is a small project, so there is no guaranteed response time.

## Areas of most interest

- Access across workspaces, or a guest seeing internal content
- Login, password reset, invites and session or token handling
- Injection (SQL, script) and CSRF
- The installer and update pages, and their setup keys

## Scope

Until there is a release, only the current main branch is considered. Do not run alpha builds with sensitive or important data.
