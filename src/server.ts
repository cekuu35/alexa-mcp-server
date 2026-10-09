/**
 * Supabase RLS Security Audit MCP Server
 * 
 * Zero-dependency MCP server (spec 2025-11-25, Streamable HTTP).
 * No SDK, no framework — pure Node.js.
 * 
 * Amazon Developer Hackathon — Alexa+ Track
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { auditRepo, renderMarkdownReport } from "./tools/audit.js";
import { Finding } from "./tools/types.js";

const PORT = parseInt(process.env.MCP_PORT || "3001", 10);

// ============================================================
// MCP Protocol Handlers (JSON-RPC 2.0)
// ============================================================

function handleInitialize(): any {
  return {
    protocolVersion: "2025-11-25",
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: {
      name: "supabase-rls-security-audit",
      version: "1.0.0",
    },
  };
}

function handleToolsList(): any {
  return {
    tools: [
      {
        name: "scan_repo",
        description:
          "Scan a public GitHub repository for Supabase/Postgres RLS security issues. Returns a severity-ranked markdown report with verify queries and fix SQL for each finding.",
        inputSchema: {
          type: "object",
          properties: {
            repo: {
              type: "string",
              description: "GitHub repository in 'owner/repo' format (e.g., 'acme/my-app')",
            },
            branch: {
              type: "string",
              description: "Branch to scan (defaults to 'main')",
            },
          },
          required: ["repo"],
        },
      },
      {
        name: "get_summary",
        description:
          "Quick summary: scan a repo and return just the finding counts by severity (no details).",
        inputSchema: {
          type: "object",
          properties: {
            repo: {
              type: "string",
              description: "GitHub repository in 'owner/repo' format",
            },
          },
          required: ["repo"],
        },
      },
      {
        name: "get_fix",
        description:
          "Get the recommended fix SQL for a specific RLS vulnerability pattern.",
        inputSchema: {
          type: "object",
          properties: {
            pattern: {
              type: "string",
              enum: [
                "anon_read_all",
                "no_to_clause",
                "authenticated_write_all",
                "committed_service_role",
                "login_helper_anon",
                "oct30_grant",
                "oct30_runtime_table",
              ],
              description: "The vulnerability pattern to get a fix for",
            },
          },
          required: ["pattern"],
        },
      },
      {
        name: "generate_rls",
        description:
          "Generate RLS policies for a Supabase table based on the table name and access pattern. Returns CREATE TABLE + GRANT + RLS policy SQL ready to copy into a migration.",
        inputSchema: {
          type: "object",
          properties: {
            table: {
              type: "string",
              description: "Table name (e.g., 'posts', 'user_profiles')",
            },
            pattern: {
              type: "string",
              enum: ["owner_only", "authenticated_read_all", "public_read", "tenant_isolated"],
              description: "Access pattern for the table",
            },
            has_user_id: {
              type: "boolean",
              description: "Whether the table has a user_id column (defaults to true)",
            },
          },
          required: ["table", "pattern"],
        },
      },
      {
        name: "oct30_readiness_check",
        description:
          "Check a repo for October 30, 2026 readiness (Supabase breaking change: auto-grants removed). Returns which CREATE TABLE statements lack GRANT and what to add.",
        inputSchema: {
          type: "object",
          properties: {
            repo: {
              type: "string",
              description: "GitHub repository in 'owner/repo' format",
            },
          },
          required: ["repo"],
        },
      },
          },
          required: ["repo"],
        },
      },
      {
        name: "get_summary",
        description:
          "Quick summary: scan a repo and return just the finding counts by severity (no details).",
        inputSchema: {
          type: "object",
          properties: {
            repo: {
              type: "string",
              description: "GitHub repository in 'owner/repo' format",
            },
          },
          required: ["repo"],
        },
      },
      {
        name: "get_fix",
        description:
          "Get the recommended fix SQL for a specific RLS vulnerability pattern.",
        inputSchema: {
          type: "object",
          properties: {
            pattern: {
              type: "string",
              enum: [
                "anon_read_all",
                "no_to_clause",
                "authenticated_write_all",
                "committed_service_role",
                "login_helper_anon",
              ],
              description: "The vulnerability pattern to get a fix for",
            },
          },
          required: ["pattern"],
        },
      },
    ],
  };
}

async function handleToolCall(name: string, args: any): Promise<any> {
  switch (name) {
    case "scan_repo": {
      const repo = args.repo;
      const branch = args.branch || "main";
      try {
        const findings = await auditRepo(repo, branch);
        const report = renderMarkdownReport(repo, findings);
        return {
          content: [{ type: "text", text: report }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error scanning ${repo}: ${error.message}` }],
          isError: true,
        };
      }
    }

    case "get_summary": {
      const repo = args.repo;
      try {
        const findings = await auditRepo(repo, "main");
        const counts: Record<string, number> = {};
        for (const f of findings) {
          counts[f.severity] = (counts[f.severity] || 0) + 1;
        }
        const emoji: Record<string, string> = {
          critical: "🔴",
          high: "🟠",
          medium: "🟡",
          low: "🔵",
        };
        const total = findings.length;
        const parts = Object.entries(counts).map(
          ([sev, n]) => `${n} ${emoji[sev] || ""} ${sev.toUpperCase()}`
        );
        const summary =
          total === 0
            ? `✅ ${repo}: CLEAN — no RLS red flags found in public source.`
            : `⚠️ ${repo}: ${total} finding(s) — ${parts.join(", ")}`;
        return {
          content: [{ type: "text", text: summary }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }

    case "get_fix": {
      const fixes: Record<string, string> = {
        anon_read_all: `-- Fix: Scope anon read access
CREATE POLICY "authenticated_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);`,
        no_to_clause: `-- Fix: Add TO clause
CREATE POLICY "users_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);`,
        authenticated_write_all: `-- Fix: Add row predicate
CREATE POLICY "write_own" ON public.notes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);`,
        committed_service_role: `-- CRITICAL: Rotate the key FIRST in Supabase dashboard → Settings → API
-- Then: remove file from repo, add .env to .gitignore, purge git history`,
        login_helper_anon: `-- Fix: SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.email_exists(email TEXT)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.users WHERE users.email = email_exists.email);
$$;
-- Then: REVOKE ALL ON public.users FROM anon;`,
      };
      const fix = fixes[args.pattern];
      if (!fix) {
        return {
          content: [{ type: "text", text: `Unknown pattern: ${args.pattern}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: fix }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
}

// ============================================================
// HTTP Server
// ============================================================

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // CORS headers for Alexa+ / external clients
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
    res.end(
      JSON.stringify({
        status: "ok",
        server: "supabase-rls-security-audit-mcp",
        version: "1.0.0",
        protocol: "2025-11-25",
        transport: "streamable-http",
      })
    );
    return;
  }

  // MCP endpoint — POST only (Streamable HTTP)
  if (req.url === "/mcp" || req.url === "/") {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ error: "Method not allowed. Use POST for MCP, GET /health for health check." }));
      return;
    }

    // Read request body
    let body = "";
    for await (const chunk of req) body += chunk;

    let request: any;
    try {
      request = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
      return;
    }

    // Handle JSON-RPC 2.0
    const { jsonrpc, id, method, params } = request;

    // Notification (no id) — just return 202
    if (id === undefined || id === null) {
      res.writeHead(202, corsHeaders);
      res.end();
      return;
    }

    let result: any;
    let error: any;

    switch (method) {
      case "initialize":
        result = handleInitialize();
        break;

      case "notifications/initialized":
        // Just an ack
        res.writeHead(202, corsHeaders);
        res.end();
        return;

      case "tools/list":
        result = handleToolsList();
        break;

      case "tools/call": {
        const { name, arguments: args } = params || {};
        try {
          result = await handleToolCall(name, args);
        } catch (e: any) {
          error = { code: -32603, message: `Internal error: ${e.message}` };
        }
        break;
      }

      case "ping":
        result = {};
        break;

      default:
        error = { code: -32601, message: `Method not found: ${method}` };
    }

    const response = error
      ? { jsonrpc: "2.0", id, error }
      : { jsonrpc: "2.0", id, result };

    res.writeHead(200, {
      "Content-Type": "application/json",
      ...corsHeaders,
    });
    res.end(JSON.stringify(response));
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json", ...corsHeaders });
  res.end(
    JSON.stringify({
      error: "Not found",
      endpoints: { mcp: "POST /mcp", health: "GET /health" },
    })
  );
});

httpServer.listen(PORT, () => {
  console.log(`\n  Supabase RLS Security Audit MCP Server`);
  console.log(`  Zero-dependency | MCP spec 2025-11-25 | Streamable HTTP`);
  console.log(`  ─────────────────────────────────────────────`);
  console.log(`  Listening:  http://localhost:${PORT}`);
  console.log(`  MCP:        http://localhost:${PORT}/mcp (POST)`);
  console.log(`  Health:     http://localhost:${PORT}/health (GET)`);
  console.log(`  Tools:      scan_repo, get_summary, get_fix\n`);
});
