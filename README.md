# Supabase RLS Security Audit MCP Server

An MCP (Model Context Protocol) server that scans GitHub repositories for Supabase/Postgres Row-Level Security (RLS) vulnerabilities.

Built for the **Amazon Developer Hackathon — Alexa+ Track**.

## What It Does

Point any MCP-compatible client (Claude, Alexa+, etc.) at this server and ask it to audit a GitHub repo. The server scans the repo's public migrations and env files for:

- 🔴 **CRITICAL** — Committed service_role JWTs and sb_secret_ keys
- 🟠 **HIGH** — RLS policies open to anon/public with `USING(true)`
- 🟡 **MEDIUM** — Write-all policies for authenticated users
- 🔵 **LOW** — Public-read on potentially sensitive tables

Every finding ships with:
- The exact file where the issue was found
- A 30-second verify query (SQL you run in your Supabase SQL editor)
- The recommended fix SQL

## MCP Tools

| Tool | Description |
|------|-------------|
| `scan_repo` | Full audit: scan a repo, get severity-ranked markdown report |
| `get_summary` | Quick summary: just the counts by severity |
| `get_fix` | Get the fix SQL for a specific vulnerability pattern |

## Quick Start

```bash
npm install
npm run build
npm start
```

Server runs on `http://localhost:3001` with:
- MCP endpoint: `http://localhost:3001/mcp` (Streamable HTTP, spec 2025-11-25+)
- Health check: `http://localhost:3001/health`

## Usage with Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "supabase-rls-audit": {
      "command": "node",
      "args": ["/path/to/alexa-mcp-server/dist/server.js"]
    }
  }
}
```

Then ask Claude: "Scan github.com/acme/my-app for RLS issues"

## How It Works

1. Fetches the repo's file tree via the GitHub API
2. Identifies `.env*` files and `.sql` migration files
3. For env files: checks for committed service_role JWTs and sb_secret_ keys
4. For SQL files: parses CREATE POLICY statements, checks for permissive patterns
5. Returns severity-ranked findings with verify queries and fix SQL

The audit engine reads **public source only** — it never touches a live database, never requires credentials, and stores nothing.

## Tested Against

The engine has been parity-tested against a Python implementation on 3 known repos:
- `Azizbek18/YotoqxonaTizimi` — 3 findings (2 HIGH, 1 MEDIUM) ✓
- `antifailure/antifailure` — 0 findings (clean) ✓
- `pixelsock/mtxProductConfig` — 2 findings (2 CRITICAL) ✓

## Method Provenance

The scanning patterns come from real production audits documented at:
- https://github.com/cekuu35/supabase-rls-leak-demo (runnable test suites)
- https://dev.to/cekuu35 (3 security articles with 30-second checks)
- https://rls.cenkkurtoglu.com (free client-side checker)

## License

MIT — see [LICENSE](LICENSE)

## Author

Cenk Kurtoglu — [github.com/cekuu35](https://github.com/cekuu35)
