import type { Idl, Program } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import { TransactionBuildError, VaultNotFoundError } from "../errors";
import { findVaultPda } from "../pda";
import type { OptimalRoutesResult, VaultAllocationResult } from "../types";
import { getAccountExists, isRecord } from "../utils";
import type { PentariumClient } from "../client";

export class YieldClient {
  private readonly client: PentariumClient;
  constructor(client: PentariumClient) {
    this.client = client;
  }

  async getOptimalRoutes(mint: PublicKey): Promise<OptimalRoutesResult> {
    const { address: vault } = findVaultPda(this.client.programId, mint);
    const exists = await getAccountExists(this.client.connection, vault, this.client.commitment);
    if (!exists) throw new VaultNotFoundError("Vault PDA account does not exist");

    const program = await this.client.program();
    const info = await this.client.connection.getAccountInfo(vault, this.client.commitment);
    if (!info) throw new VaultNotFoundError("Vault PDA account missing");
    if (!info.owner.equals(this.client.programId)) throw new TransactionBuildError("Vault account not owned by program");

    const decoded = decodeVaultAccount(program, info.data);
    const routes = extractPublicKeyArray(decoded, ["optimalRoutes", "routes", "routeMints", "routeVaults"]);
    if (routes.length === 0) {
      throw new TransactionBuildError("Unable to extract optimal routes from vault account (no recognized routes field)");
    }

    return {
      vault,
      routes,
      rawVaultAccount: decoded
    };
  }

  async getVaultAllocation(mint: PublicKey): Promise<VaultAllocationResult> {
    const { address: vault } = findVaultPda(this.client.programId, mint);
    const exists = await getAccountExists(this.client.connection, vault, this.client.commitment);
    if (!exists) throw new VaultNotFoundError("Vault PDA account does not exist");

    const program = await this.client.program();
    const info = await this.client.connection.getAccountInfo(vault, this.client.commitment);
    if (!info) throw new VaultNotFoundError("Vault PDA account missing");
    if (!info.owner.equals(this.client.programId)) throw new TransactionBuildError("Vault account not owned by program");

    const decoded = decodeVaultAccount(program, info.data);
    const allocation = extractAllocation(decoded);
    if (allocation === null) {
      throw new TransactionBuildError("Unable to extract allocation data from vault account (no recognized allocation field)");
    }

    return {
      vault,
      allocation,
      rawVaultAccount: decoded
    };
  }
}

function decodeVaultAccount(program: Program<Idl>, data: Buffer): unknown {
  const idlAccounts = program.idl.accounts ?? [];
  const candidates = idlAccounts
    .map((a) => a.name)
    .filter((n) => n.toLowerCase() === "vault" || n.toLowerCase().includes("vault"));

  const tryNames = candidates.length > 0 ? candidates : ["vault", "Vault"];
  for (const name of tryNames) {
    try {
      return program.coder.accounts.decode(name, data);
    } catch {
      continue;
    }
  }
  throw new TransactionBuildError("Unable to decode vault account with IDL (no matching account name)");
}

function extractPublicKeyArray(decoded: unknown, keys: ReadonlyArray<string>): ReadonlyArray<PublicKey> {
  if (!isRecord(decoded)) return [];
  for (const key of keys) {
    const v = decoded[key];
    const parsed = asPublicKeyArray(v);
    if (parsed) return parsed;
  }
  return [];
}

function asPublicKeyArray(value: unknown): ReadonlyArray<PublicKey> | null {
  if (!Array.isArray(value)) return null;
  const out: PublicKey[] = [];
  for (const entry of value) {
    if (entry && typeof entry === "object" && "toBase58" in entry) {
      out.push(entry as PublicKey);
    } else {
      return null;
    }
  }
  return out;
}

function extractAllocation(decoded: unknown): unknown | null {
  if (!isRecord(decoded)) return null;
  const candidates = ["allocation", "allocations", "yieldAllocation", "targetAllocation", "routingAllocation"];
  for (const key of candidates) {
    if (key in decoded) return decoded[key];
  }
  return null;
}
