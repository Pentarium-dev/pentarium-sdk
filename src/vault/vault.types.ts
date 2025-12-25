import type { PublicKey, Transaction } from "@solana/web3.js";
import type { DepositParams, WithdrawParams } from "../types";

export interface VaultDiscoveryResult {
  vaultPda: PublicKey;
  vaultAuthorityPda: PublicKey;
}

export interface BuiltVaultTransaction {
  transaction: Transaction;
}

export type DepositRequest = DepositParams;
export type WithdrawRequest = WithdrawParams;
