import { z } from "zod";
import { getWalletPath } from "../config.js";
import { readFileSync, existsSync } from "node:fs";

export const walletStatusSchema = {};

export async function handleWalletStatus(
  _args: Record<string, never>,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const walletPath = getWalletPath();

  if (!existsSync(walletPath)) {
    return {
      content: [
        {
          type: "text",
          text: "No wallet found. Use `wallet_create` to create one.",
        },
      ],
    };
  }

  try {
    const wallet = JSON.parse(readFileSync(walletPath, "utf-8"));
    const lines = [
      `## Wallet Status`,
      ``,
      `| Field | Value |`,
      `|-------|-------|`,
      `| address | \`${wallet.address}\` |`,
      `| created | ${wallet.created || "unknown"} |`,
      `| funded | ${wallet.funded ? "yes" : "no"} |`,
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch {
    return {
      content: [
        {
          type: "text",
          text: `Error: Could not read wallet file at ${walletPath}`,
        },
      ],
      isError: true,
    };
  }
}
