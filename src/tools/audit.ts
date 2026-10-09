/**
 * RLS Audit Engine — scans public GitHub repos for Supabase/Postgres security issues.
 * TypeScript port of the Python audit_rls.py engine (parity-tested on 3 repos).
 */

import { Finding } from "./types.js";

const GH_API = "https://api.github.com";
const GH_RAW = "https://raw.githubusercontent.com";

interface InterestingFiles {
  envFiles: string[];
  sqlFiles: string[];
}

async function ghJSON(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function rawText(repo: string, path: string, branch: string): Promise<string | null> {
  for (const b of [branch, "main", "master"]) {
    try {
      const res = await fetch(`${GH_RAW}/${repo}/${b}/${path}`);
      if (res.ok) return res.text();
    } catch { /* try next branch */ }
  }
  return null;
}

async function listInterestingFiles(repo: string): Promise<InterestingFiles> {
  try {
    const tree = await ghJSON(`${GH_API}/repos/${repo}/git/trees/HEAD?recursive=1`);
    const envFiles: string[] = [];
    const sqlFiles: string[] = [];
    for (const t of tree.tree || []) {
      if (t.type !== "blob") continue;
      const p = t.path;
      if (/\.env(\.|$)/.test(p) && !/\.md$/.test(p)) envFiles.push(p);
      if (/\.sql$/.test(p) && /migration|supabase|database|^db\//i.test(p)) sqlFiles.push(p);
    }
    return { envFiles: envFiles.slice(0, 6), sqlFiles: sqlFiles.slice(0, 40) };
  } catch {
    return { envFiles: [], sqlFiles: [] };
  }
}

function scanPolicyText(content: string, file: string, findings: Finding[]): void {
  // Matches: CREATE POLICY "name with spaces" ON table ...;  OR  CREATE POLICY simple_name ON table ...;
  const policyRegex = /create\s+policy\s+(?:"([^"]+)"|([^\s(;]+))\s+on\s+([\w"'.]+)([\s\S]*?);/gi;
  let match: RegExpExecArray | null;
  while ((match = policyRegex.exec(content)) !== null) {
    const name = (match[1] || match[2] || "").trim();  // group 1 = quoted, group 2 = unquoted
    const table = (match[3] || "").replace(/"/g, "");
    const body = (match[4] || "").replace(/\s+/g, " ").toLowerCase();
    const toAnon = /\bto\s+anon\b/.test(body) || /\bto\s+public\b/.test(body);
    const noTo = !/\bto\s+\w/.test(body);
    const usingTrue = /using\s*\(\s*true\s*\)/.test(body);
    const checkTrue = /with\s+check\s*\(\s*true\s*\)/.test(body);
    const forSelect = /\bfor\s+select\b/.test(body);

    if ((toAnon || noTo) && usingTrue) {
      const aud = toAnon ? "anon" : "public (no TO clause — includes anon)";
      findings.push({
        severity: "high",
        file,
        title: `Policy '${name}' on ${table} is open to ${aud}`,
        detail: `USING(true) with no row predicate — anyone holding the anon key can read this table.`,
        verify: `select policyname, roles, cmd, qual from pg_policies where tablename = '${table}';`,
        fix: `Add TO authenticated and a row predicate (e.g., auth.uid() = user_id).`,
      });
    } else if (/\bto\s+authenticated\b/.test(body) && usingTrue && checkTrue && !forSelect) {
      findings.push({
        severity: "medium",
        file,
        title: `Policy '${name}' on ${table} lets any authenticated user write any row`,
        detail: `USING(true) WITH CHECK(true) with no row predicate.`,
        verify: `select policyname, roles, cmd, qual, with_check from pg_policies where tablename = '${table}';`,
        fix: `Restrict writes: with check (auth.uid() = user_id)`,
      });
    }
  }
}

function scanEnvText(content: string, file: string, findings: Finding[]): void {
  // Check for real service_role JWT
  const jwtMatch = /eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/.exec(content);
  if (jwtMatch) {
    try {
      const payload = JSON.parse(Buffer.from(jwtMatch[0].split(".")[1], "base64").toString());
      if (payload.role === "service_role") {
        findings.push({
          severity: "critical",
          file,
          title: `Committed service_role JWT (project ${payload.ref || "?"})`,
          detail: `A full RLS-bypass key appears to be committed in public source.`,
          verify: `Open the file, paste the eyJ... value into jwt.io — payload shows role=service_role.`,
          fix: `Rotate the key in Supabase dashboard → Settings → API FIRST, then remove the file.`,
        });
      }
    } catch { /* not a valid JWT, skip */ }
  }

  // Check for sb_secret_ pattern
  const sbMatch = /sb_secret_[A-Za-z0-9_\-]{8,}/.exec(content);
  if (sbMatch && !/sb_secret_(replace_me|your|xxx|\.\.\.)/i.test(content)) {
    findings.push({
      severity: "critical",
      file,
      title: `Committed sb_secret_ key`,
      detail: `A new-format secret key (full database access) appears committed.`,
      verify: `Open the file — any non-placeholder sb_secret_ value is live until rotated.`,
      fix: `Rotate in the Supabase dashboard, remove the file, add to .gitignore.`,
    });
  }
}

export async function auditRepo(repo: string, branch: string = "main"): Promise<Finding[]> {
  // Validate repo format
  const repoMatch = /github\.com\/([\w.-]+)\/([\w.-]+)/.exec(repo);
  const repoPath = repoMatch ? `${repoMatch[1]}/${repoMatch[2]}` : repo;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repoPath)) {
    throw new Error(`Invalid repo format: ${repo}. Use 'owner/repo' or a GitHub URL.`);
  }

  const files = await listInterestingFiles(repoPath);
  const findings: Finding[] = [];

  // Scan env files
  for (const p of files.envFiles) {
    const content = await rawText(repoPath, p, branch);
    if (content) scanEnvText(content, p, findings);
  }

  // Scan SQL migration files
  for (const p of files.sqlFiles) {
    const content = await rawText(repoPath, p, branch);
    if (content) scanPolicyText(content, p, findings);
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique = findings.filter(f => {
    const key = `${f.severity}|${f.file}|${f.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by severity
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return unique.sort((a, b) => (order[a.severity] || 9) - (order[b.severity] || 9));
}

export function renderMarkdownReport(repo: string, findings: Finding[]): string {
  if (findings.length === 0) {
    return `# RLS Audit: ${repo}\n\n✅ No RLS red flags found in public source.\n\n*Scanned migrations + env files. Public source only.*`;
  }

  const lines = [
    `# RLS Security Audit: ${repo}`,
    ``,
    `**${findings.length} finding(s), severity-ranked.**`,
    ``,
  ];

  let currentSeverity = "";
  for (const f of findings) {
    if (f.severity !== currentSeverity) {
      currentSeverity = f.severity;
      lines.push(`## ${severityEmoji(f.severity)} ${f.severity.toUpperCase()}`, ``);
    }
    lines.push(`- **${f.title}** (\`${f.file}\`)`);
    lines.push(`  - ${f.detail}`);
    lines.push(`  - Verify: \`${f.verify}\``);
    lines.push(`  - Fix: ${f.fix}`);
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`*Public source only — no database was accessed.*`);
  return lines.join("\n");
}

function severityEmoji(sev: string): string {
  switch (sev) {
    case "critical": return "🔴";
    case "high": return "🟠";
    case "medium": return "🟡";
    default: return "🔵";
  }
}
