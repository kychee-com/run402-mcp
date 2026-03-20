/**
 * Shared payment wrapper for CLI commands that need paid fetch.
 * Branches on allowance rail:
 *   - "mpp": uses mppx.fetch (Tempo pathUSD)
 *   - "x402" (default): uses @x402/fetch (Base USDC)
 */

import { readAllowance, ALLOWANCE_FILE } from "./config.mjs";
import { existsSync } from "fs";

export async function setupPaidFetch() {
  if (!existsSync(ALLOWANCE_FILE)) {
    console.error(JSON.stringify({ status: "error", message: "No agent allowance found. Run: run402 allowance create && run402 allowance fund" }));
    process.exit(1);
  }
  const allowance = readAllowance();
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(allowance.privateKey);

  if (allowance.rail === "mpp") {
    const { Mppx, tempo } = await import("mppx/client");
    const mppx = Mppx.create({
      polyfill: false,
      methods: [tempo({ account })],
    });
    return mppx.fetch;
  }

  // Default: x402 (existing behavior)
  const { createPublicClient, http } = await import("viem");
  const { base, baseSepolia } = await import("viem/chains");
  const { x402Client, wrapFetchWithPayment } = await import("@x402/fetch");
  const { ExactEvmScheme } = await import("@x402/evm/exact/client");
  const { toClientEvmSigner } = await import("@x402/evm");

  const mainnetClient = createPublicClient({ chain: base, transport: http() });
  const sepoliaClient = createPublicClient({ chain: baseSepolia, transport: http() });

  const client = new x402Client();
  client.register("eip155:8453", new ExactEvmScheme(toClientEvmSigner(account, mainnetClient)));
  client.register("eip155:84532", new ExactEvmScheme(toClientEvmSigner(account, sepoliaClient)));
  return wrapFetchWithPayment(fetch, client);
}
