// Self-contained debug
const repo = "Azizbek18/YotoqxonaTizimi";
const GH_API = "https://api.github.com";
const GH_RAW = "https://raw.githubusercontent.com";

console.log("=== DEBUG:", repo, "===");

// Fetch tree
const treeRes = await fetch(`${GH_API}/repos/${repo}/git/trees/HEAD?recursive=1`);
if (!treeRes.ok) { console.log("Tree fetch failed:", treeRes.status); process.exit(1); }
const tree = await treeRes.json();

const envFiles: string[] = [];
const sqlFiles: string[] = [];
for (const t of tree.tree || []) {
  if (t.type !== "blob") continue;
  const p = t.path;
  if (/\.env(\.|$)/.test(p) && !/\.md$/.test(p)) envFiles.push(p);
  if (/\.sql$/.test(p) && /migration|supabase|database|^db\//i.test(p)) sqlFiles.push(p);
}

console.log("envFiles:", envFiles.slice(0, 5));
console.log("sqlFiles:", sqlFiles.slice(0, 10));

// Fetch one SQL file
if (sqlFiles.length > 0) {
  const first = sqlFiles[0];
  console.log("\nFetching:", first);
  const rawRes = await fetch(`${GH_RAW}/${repo}/main/${first}`);
  const content = rawRes.ok ? await rawRes.text() : null;
  
  if (content) {
    console.log("Content length:", content.length);
    console.log("Has CREATE POLICY:", /create\s+policy/i.test(content));
    console.log("Has USING(true):", /using\s*\(\s*true\s*\)/i.test(content));
    
    // Test regex
    const policyRegex = /create\s+policy\s+"?([^"\s;]+)"?\s+on\s+([\w"'.]+)([\s\S]*?);/gi;
    let match;
    let count = 0;
    while ((match = policyRegex.exec(content)) !== null) {
      count++;
      if (count <= 3) {
        console.log(`  Match ${count}: name=${match[1]}, table=${match[2]}`);
      }
    }
    console.log("Total policy matches:", count);
  } else {
    console.log("Content is NULL (status:", rawRes.status, ")");
  }
}

// Also check: does the repo tree have ANY sql files?
const allSql = (tree.tree || []).filter((t: any) => t.path.endsWith(".sql")).map((t: any) => t.path);
console.log("\nAll .sql files in tree:", allSql.length);
console.log("Sample:", allSql.slice(0, 5));

process.exit(0);
