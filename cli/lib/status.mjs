import { readAllowance, loadKeyStore, getActiveProjectId, API } from "./config.mjs";
import { getAllowanceAuthHeaders } from "../core-dist/allowance-auth.js";

const HELP = `run402 status — Show full account state in one shot

Usage:
  run402 status

Displays:
  - Allowance address and funding status
  - Billing balance (available + held)
  - Tier subscription (name, status, expiry)
  - Projects (from server, with fallback to local keystore)
  - Active project ID

Output is JSON. Requires an existing allowance (run 'run402 init' first).
`;

export async function run(args = []) {
  if (args.includes("--help") || args.includes("-h")) { console.log(HELP); process.exit(0); }
  const allowance = readAllowance();
  if (!allowance) {
    console.log(JSON.stringify({ status: "no_allowance", message: "No agent allowance found. Run: run402 init" }));
    return;
  }

  const wallet = allowance.address.toLowerCase();
  const authHeaders = getAllowanceAuthHeaders("/tiers/v1/status");

  // Parallel API calls: tier + billing balance + server-side projects
  const [tierRes, balanceRes, projectsRes] = await Promise.all([
    authHeaders
      ? fetch(`${API}/tiers/v1/status`, { headers: { ...authHeaders } }).catch(() => null)
      : null,
    fetch(`${API}/billing/v1/accounts/${wallet}`).catch(() => null),
    fetch(`${API}/wallets/v1/${wallet}/projects`).catch(() => null),
  ]);

  const tier = tierRes?.ok ? await tierRes.json() : null;
  const billing = balanceRes?.ok ? await balanceRes.json() : null;
  const remote = projectsRes?.ok ? await projectsRes.json() : null;

  // Local keystore
  const store = loadKeyStore();
  const activeId = getActiveProjectId();

  const result = {
    allowance: {
      address: allowance.address,
      funded: allowance.funded || false,
    },
    tier: tier && tier.tier
      ? { name: tier.tier, status: tier.status, expires: tier.lease_expires_at }
      : null,
    balance: billing && billing.exists
      ? { available_usd_micros: billing.available_usd_micros, held_usd_micros: billing.held_usd_micros }
      : null,
    projects: remote?.projects || Object.keys(store.projects).map(id => ({ id })),
    active_project: activeId || null,
  };

  console.log(JSON.stringify(result, null, 2));
}
