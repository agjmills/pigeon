# Contributing to Pigeon

Thanks for your interest in contributing!

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and [Release Please](https://github.com/googleapis/release-please) for automated releases. Every commit to `main` must follow this format:

```
<type>: <description>

[optional body]
```

### Types

| Type | Purpose |
|------|---------|
| `feat` | New feature (triggers minor version bump) |
| `fix` | Bug fix (triggers patch version bump) |
| `docs` | Documentation only |
| `chore` | Maintenance, deps, CI |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |

### Breaking changes

Append `!` after the type to trigger a major version bump:

```
feat!: replace EMAIL_PROVIDER_CONFIG format
```

### Examples

```
feat: add Postmark email provider
fix: handle missing In-Reply-To header on first message
docs: add SES configuration example to README
chore: bump hono to v4.5
```

## Pull requests

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Ensure `npx tsc --noEmit` passes
4. Open a PR with a conventional commit title (the PR title becomes the squash commit message)

## Adding an email provider

1. Create `src/lib/providers/<name>.ts` implementing `EmailSender` and optionally `EmailDomainProvider`
2. Export a config type and factory function (see `src/lib/providers/resend.ts`)
3. Add a case to the switch in `src/lib/email-provider.ts`
4. Document the `EMAIL_PROVIDER_CONFIG` shape in the README
