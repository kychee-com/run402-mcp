# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

run402-mcp is an MCP (Model Context Protocol) server that exposes Run402 developer tools — provisioning Postgres databases, deploying static sites and serverless functions, managing storage, secrets, subdomains, and x402 USDC micropayments. It ships three interfaces from this monorepo:

- **MCP server** (root `src/`) — the main package, published as `run402-mcp` on npm
- **CLI** (`cli/`) — standalone CLI published as `run402` on npm, uses `@x402/fetch` for payments
- **OpenClaw skill** (`openclaw/`) — skill for OpenClaw agents, calls the API via Node.js scripts

## Build & Test Commands

```bash
npm run build          # tsc → dist/
npm run start          # node dist/index.js (stdio MCP transport)
npm run test:skill     # node --test --import tsx SKILL.test.ts (validates SKILL.md frontmatter/body)
npm run test:sync      # node --test --import tsx sync.test.ts (checks MCP/CLI/OpenClaw stay in sync)
npm test               # runs all tests (SKILL.test.ts + sync.test.ts + src/**/*.test.ts)
```

Unit tests use Node's built-in `node:test` runner with `tsx` for TypeScript:

```bash
# Run all unit tests
node --test --import tsx src/**/*.test.ts

# Run a single test file
node --test --import tsx src/tools/run-sql.test.ts
node --test --import tsx src/client.test.ts
```

Tests are excluded from the build (`tsconfig.json` excludes `src/**/*.test.ts`).

### Sync Test (`sync.test.ts`)

`sync.test.ts` defines the canonical API surface in a `SURFACE` array and checks:
- MCP tools in `src/index.ts` match the expected set (no missing, no extra)
- CLI commands in `cli/lib/*.mjs` match the expected set
- OpenClaw commands in `openclaw/scripts/*.mjs` match the expected set
- CLI and OpenClaw have identical command sets (parity)
- If `~/dev/run402/site/llms.txt` exists: MCP Tools table lists all tools, all endpoints documented

When adding a new tool/command, add it to the `SURFACE` array in `sync.test.ts`.

## Architecture

### Core Modules (`src/`)

- **`index.ts`** — Entry point. Creates the `McpServer`, registers all tools with their Zod schemas and handlers, connects via `StdioServerTransport`.
- **`client.ts`** — Single `apiRequest()` function wrapping `fetch()` against `RUN402_API_BASE`. Handles JSON/text responses and identifies 402 (payment required) responses with `is402` flag.
- **`config.ts`** — Reads `RUN402_API_BASE` (default `https://api.run402.com`) and `RUN402_CONFIG_DIR` (default `~/.config/run402`) from env.
- **`keystore.ts`** — Atomic file-based credential store at `~/.config/run402/projects.json` (mode 0600). Uses temp-file + rename for safe writes.

### Tool Pattern

Every tool in `src/tools/` exports two things:
1. A Zod schema object (e.g., `provisionSchema`) defining input parameters
2. An async handler function (e.g., `handleProvision`) returning `{ content: [{type: "text", text: string}], isError?: boolean }`

Tools that require payment (provision, renew, deploy_site, bundle_deploy) return 402 payment details as **informational text** (not errors) so the LLM can reason about payment flow.

### Error Handling Pattern

All tools use shared error helpers from `src/errors.ts`:

- **`formatApiError(res, context)`** — Formats a non-OK API response into the standard `{ content: [...], isError: true }` shape. Includes HTTP status, extracts `hint`/`retry_after`/`renew_url`/`usage`/`expires_at` from the response body, and adds actionable guidance based on status code. The `context` parameter is a short verb phrase describing what failed (e.g. "running SQL").

- **`projectNotFound(projectId)`** — Returns a consistent "project not found in key store" error with guidance to provision first.

When adding a new tool, use these helpers instead of inline error formatting:
```ts
if (!project) return projectNotFound(args.project_id);
// ...
if (!res.ok) return formatApiError(res, "doing the thing");
```

### Test Pattern

Tests mock `globalThis.fetch` and use temp directories for keystore isolation. Each test file follows:
- `beforeEach`: set `RUN402_API_BASE` env, create temp keystore, mock fetch
- `afterEach`: restore original fetch and env, clean up temp dir

### SKILL.md

`SKILL.md` is the OpenClaw skill definition with YAML frontmatter + markdown body. `SKILL.test.ts` validates its structure (frontmatter fields, required sections, tool references, markdown integrity). Run with `npm run test:skill`.

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `RUN402_API_BASE` | `https://api.run402.com` | API base URL (override for testing/staging) |
| `RUN402_CONFIG_DIR` | `~/.config/run402` | Local credential storage directory |
