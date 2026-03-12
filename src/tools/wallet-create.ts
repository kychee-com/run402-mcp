import { z } from "zod";
import { getWalletPath } from "../config.js";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomBytes, createECDH } from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3.js";

export const walletCreateSchema = {};

export async function handleWalletCreate(
  _args: Record<string, never>,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const walletPath = getWalletPath();

  if (existsSync(walletPath)) {
    try {
      const existing = JSON.parse(readFileSync(walletPath, "utf-8"));
      return {
        content: [
          {
            type: "text",
            text: `Wallet already exists at \`${walletPath}\`.\n\nAddress: \`${existing.address}\`\n\nUse \`wallet_status\` to check details.`,
          },
        ],
        isError: true,
      };
    } catch {
      // corrupt file — fall through and create a new one
    }
  }

  // Generate private key
  const privateKeyBytes = randomBytes(32);
  const privateKey = `0x${privateKeyBytes.toString("hex")}`;

  // Derive public key using secp256k1
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(privateKeyBytes);
  const uncompressedPubKey = ecdh.getPublicKey();
  // Remove the 04 prefix (uncompressed point marker)
  const pubKeyBody = uncompressedPubKey.subarray(1);

  // Ethereum address = last 20 bytes of keccak256(publicKey)
  const hash = keccak_256(pubKeyBody);
  const addressBytes = hash.slice(-20);
  const address = `0x${Buffer.from(addressBytes).toString("hex")}`;

  // Save wallet
  const wallet = {
    address,
    privateKey,
    created: new Date().toISOString(),
    funded: false,
  };

  const dir = dirname(walletPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(walletPath, JSON.stringify(wallet, null, 2), { mode: 0o600 });
  chmodSync(walletPath, 0o600);

  const lines = [
    `## Wallet Created`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| address | \`${address}\` |`,
    `| saved to | \`${walletPath}\` |`,
    ``,
    `Use \`request_faucet\` to fund it with testnet USDC, or send USDC on any supported chain.`,
  ];

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
