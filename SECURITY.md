# Security policy

Tangent is in beta as of `v0.1.0-beta.1`. The core workspace and installation workflows are implemented, and installation and upgrades have been verified on one shared server; other hosting environments are still being checked. There is no supported stable release yet. Security reports are welcome, especially about authentication, invites, workspace separation and the client guest view.

## Reporting a vulnerability

Please do not open a public issue for security problems. Report privately through the repository's **Security** tab ("Report a vulnerability").

Include what you found, how to reproduce it, and the version or commit you tested. You will get a reply as soon as practical. This is a small project, so there is no guaranteed response time.

## Areas of most interest

- Access across workspaces, or a guest seeing internal content
- Login, password reset, invites and session or token handling
- Injection (SQL, script) and CSRF
- The installer and update pages, and their setup keys

## Scope

Only the current default branch receives security fixes; older tags are not maintained. The beta tag is a pre-release snapshot, not a supported stable release. Keep tested backups and do not rely on a beta installation as the only copy of important data.
