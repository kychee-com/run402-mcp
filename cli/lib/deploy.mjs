import { readFileSync } from "fs";
import { API, allowanceAuthHeaders, saveProject, setActiveProjectId } from "./config.mjs";

const HELP = `run402 deploy — Deploy a full-stack app or static site on Run402

Usage:
  run402 deploy [options]
  cat manifest.json | run402 deploy [options]

Options:
  --manifest <file>    Path to manifest JSON file  (default: read from stdin)
  --help, -h           Show this help message

Manifest format (JSON):
  {
    "name": "my-app",
    "migrations": "CREATE TABLE items (id serial PRIMARY KEY, title text NOT NULL, done boolean DEFAULT false)",
    "rls": {
      "template": "public_read_write",
      "tables": [{ "table": "items" }]
    },
    "secrets": [{ "key": "OPENAI_API_KEY", "value": "sk-..." }],
    "functions": [{
      "name": "my-fn",
      "code": "export default async (req) => new Response('ok')"
    }],
    "files": [{ "file": "index.html", "data": "<html>...</html>" }],
    "subdomain": "my-app"
  }

  All fields except "name" are optional.

  RLS templates:
    user_owns_rows   — users see only their rows (requires owner_column per table)
    public_read      — anyone reads, authenticated users write
    public_read_write — anyone reads and writes

  ⚠️  Without RLS, tables are read-only via anon_key. If your app writes
  data from the browser, you almost certainly need an rls block.

Examples:
  run402 deploy --manifest app.json
  cat app.json | run402 deploy

Prerequisites:
  - run402 init                     Set up allowance and funding
  - run402 tier set prototype       Subscribe to a tier

Notes:
  - Requires an active tier subscription (run402 tier set <tier>)
  - Project credentials (project_id, keys, URL) are saved locally after deploy
  - Use 'run402 projects list' to see all deployed projects
`;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

export async function run(args) {
  const opts = { manifest: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") { console.log(HELP); process.exit(0); }
    if (args[i] === "--manifest" && args[i + 1]) opts.manifest = args[++i];
  }

  const manifest = opts.manifest ? JSON.parse(readFileSync(opts.manifest, "utf-8")) : JSON.parse(await readStdin());

  const authHeaders = await allowanceAuthHeaders();
  const res = await fetch(`${API}/deploy/v1`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify(manifest) });
  const result = await res.json();
  if (!res.ok) { console.error(JSON.stringify({ status: "error", http: res.status, ...result })); process.exit(1); }
  if (result.project_id) {
    saveProject(result.project_id, {
      anon_key: result.anon_key, service_key: result.service_key,
      site_url: result.site_url || result.subdomain_url,
      deployed_at: new Date().toISOString(),
    });
    setActiveProjectId(result.project_id);
  }
  console.log(JSON.stringify(result, null, 2));
}
