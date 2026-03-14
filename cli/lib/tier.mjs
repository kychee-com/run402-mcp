import { readWallet, WALLET_FILE, API } from "./config.mjs";
import { existsSync } from "fs";

const HELP = `run402 tier — Manage your Run402 tier subscription

Usage:
  run402 tier <subcommand> [args...]

Subcommands:
  status                Show current tier (tier name, status, expiry)
  set <tier>            Subscribe, renew, or upgrade (pays via x402)

Tiers: prototype ($0.10/7d), hobby ($5/30d), team ($20/30d)

The server auto-detects the action based on your wallet state:
  - No tier or expired  → subscribe
  - Same tier, active   → renew (extends from expiry)
  - Higher tier         → upgrade (prorated refund to allowance)
  - Lower tier, active  → rejected (wait for expiry)

Examples:
  run402 tier status
  run402 tier set prototype
  run402 tier set hobby
`;

async function setupPaidFetch() {
  if (!existsSync(WALLET_FILE)) {
    console.error(JSON.stringify({ status: "error", message: "No wallet found. Run: run402 wallet create && run402 wallet fund" }));
    process.exit(1);
  }
  const wallet = readWallet();
  const { privateKeyToAccount } = await import("viem/accounts");
  const { createPublicClient, http } = await import("viem");
  const { baseSepolia } = await import("viem/chains");
  const { x402Client, wrapFetchWithPayment } = await import("@x402/fetch");
  const { ExactEvmScheme } = await import("@x402/evm/exact/client");
  const { toClientEvmSigner } = await import("@x402/evm");
  const account = privateKeyToAccount(wallet.privateKey);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
  const signer = toClientEvmSigner(account, publicClient);
  const client = new x402Client();
  client.register("eip155:84532", new ExactEvmScheme(signer));
  return wrapFetchWithPayment(fetch, client);
}

async function status() {
  const w = readWallet();
  if (!w) { console.log(JSON.stringify({ status: "error", message: "No wallet. Run: run402 wallet create" })); process.exit(1); }
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(w.privateKey);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await account.signMessage({ message: `run402:${timestamp}` });
  const res = await fetch(`${API}/tiers/v1/status`, {
    headers: { "X-Run402-Wallet": account.address, "X-Run402-Signature": signature, "X-Run402-Timestamp": timestamp },
  });
  const data = await res.json();
  if (!res.ok) { console.error(JSON.stringify({ status: "error", http: res.status, ...data })); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
}

async function set(tierName) {
  if (!tierName) { console.error(JSON.stringify({ status: "error", message: "Usage: run402 tier set <prototype|hobby|team>" })); process.exit(1); }
  const fetchPaid = await setupPaidFetch();
  const res = await fetchPaid(`${API}/tiers/v1/${tierName}`, { method: "POST", headers: { "Content-Type": "application/json" } });
  const data = await res.json();
  if (!res.ok) { console.error(JSON.stringify({ status: "error", http: res.status, ...data })); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
}

export async function run(sub, args) {
  if (!sub || sub === '--help' || sub === '-h') {
    console.log(HELP);
    process.exit(0);
  }
  switch (sub) {
    case "status": await status(); break;
    case "set":    await set(args[0]); break;
    default:
      console.error(`Unknown subcommand: ${sub}\n`);
      console.log(HELP);
      process.exit(1);
  }
}
