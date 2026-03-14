#!/usr/bin/env node
/**
 * Run402 tier manager — check and set tier subscription.
 *
 * Usage:
 *   node tier.mjs status              # Show current tier
 *   node tier.mjs set <tier>          # Subscribe, renew, or upgrade (x402 payment)
 */

import { readWallet, API, WALLET_FILE } from "./config.mjs";
import { existsSync } from "fs";

async function setupPaidFetch() {
  if (!existsSync(WALLET_FILE)) {
    console.error(JSON.stringify({ status: "error", message: "No wallet found. Run: node wallet.mjs create && node wallet.mjs fund" }));
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
  if (!w) { console.log(JSON.stringify({ status: "error", message: "No wallet. Run: node wallet.mjs create" })); process.exit(1); }
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
  if (!tierName) { console.error(JSON.stringify({ status: "error", message: "Usage: node tier.mjs set <prototype|hobby|team>" })); process.exit(1); }
  const fetchPaid = await setupPaidFetch();
  const res = await fetchPaid(`${API}/tiers/v1/${tierName}`, { method: "POST", headers: { "Content-Type": "application/json" } });
  const data = await res.json();
  if (!res.ok) { console.error(JSON.stringify({ status: "error", http: res.status, ...data })); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "status": await status(); break;
  case "set": await set(args[0]); break;
  default:
    console.log("Usage: node tier.mjs <status|set> [args...]");
    process.exit(1);
}
