import type { Idl } from "@coral-xyz/anchor";
import type {
  Commitment,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction
} from "@solana/web3.js";

export type U64Input = bigint | number | string;

export interface AnchorWallet {
  publicKey: PublicKey | null;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

export interface PentariumClientOptions {
  connection: Connection;
  wallet: AnchorWallet;
  programId: PublicKey;
  commitment?: Commitment;
  idl?: Idl;
}

export interface BuildTransactionResult {
  transaction: Transaction;
  instructions: ReadonlyArray<TransactionInstruction>;
}

export interface DepositParams {
  mint: PublicKey;
  amount: U64Input;
}

export interface WithdrawParams {
  mint: PublicKey;
  amount: U64Input;
}

export interface SwapExecuteParams {
  fromMint: PublicKey;
  toMint: PublicKey;
  amount: U64Input;
  maxSlippageBps: number;
}

export interface DecodedOnChainAccount {
  address: PublicKey;
  accountName: string;
  data: unknown;
}

export interface VaultAllocationResult {
  vault: PublicKey;
  allocation: unknown;
  rawVaultAccount: unknown;
}

export interface OptimalRoutesResult {
  vault: PublicKey;
  routes: ReadonlyArray<PublicKey>;
  rawVaultAccount: unknown;
}
