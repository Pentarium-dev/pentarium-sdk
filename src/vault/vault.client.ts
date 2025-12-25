import type { Idl, Program } from "@coral-xyz/anchor";
import type { PublicKey, Transaction } from "@solana/web3.js";
import { TransactionBuildError, VaultNotFoundError } from "../errors";
import { findUserPositionPda, findVaultAuthorityPda, findVaultPda } from "../pda";
import type { DepositParams, WithdrawParams } from "../types";
import { buildTransaction, ensureAtaIxs, getAccountExists, pickFirstU64LikeField, toBigIntAmount, toBnU64 } from "../utils";
import type { PentariumClient } from "../client";
import { buildDepositInstruction, buildWithdrawInstruction, resolveVaultAccountsForIdl } from "./vault.instructions";

const POSITION_BALANCE_CANDIDATES: ReadonlyArray<string> = [
  "depositedAmount",
  "depositAmount",
  "amount",
  "balance",
  "shares",
  "principal",
  "deposited"
];

export class VaultClient {
  private readonly client: PentariumClient;
  constructor(client: PentariumClient) {
    this.client = client;
  }

  async discover(mint: PublicKey): Promise<{ vaultPda: PublicKey; vaultAuthorityPda: PublicKey }> {
    const { address: vaultPda } = findVaultPda(this.client.programId, mint);
    const { address: vaultAuthorityPda } = findVaultAuthorityPda(this.client.programId, vaultPda);
    return { vaultPda, vaultAuthorityPda };
  }

  async deposit(params: DepositParams): Promise<Transaction> {
    const payer = this.client.payer();
    const amount = toBigIntAmount(params.amount);
    const amountBn = toBnU64(amount);

    const { address: vaultPda } = findVaultPda(this.client.programId, params.mint);
    const vaultExists = await getAccountExists(this.client.connection, vaultPda, this.client.commitment);
    if (!vaultExists) throw new VaultNotFoundError("Vault PDA account does not exist");

    const { address: vaultAuthority } = findVaultAuthorityPda(this.client.programId, vaultPda);
    const { address: position } = findUserPositionPda(this.client.programId, vaultPda, payer);

    const userAta = await ensureAtaIxs({
      connection: this.client.connection,
      mint: params.mint,
      owner: payer,
      payer,
      allowOwnerOffCurve: false,
      commitment: this.client.commitment
    });

    const vaultAta = await ensureAtaIxs({
      connection: this.client.connection,
      mint: params.mint,
      owner: vaultAuthority,
      payer,
      allowOwnerOffCurve: true,
      commitment: this.client.commitment
    });

    const program = await this.client.program();

    const instructionName = program.idl.instructions.some((ix) => ix.name === "deposit") ? "deposit" : "deposit";
    const accounts = resolveVaultAccountsForIdl({
      program,
      instructionName,
      user: payer,
      mint: params.mint,
      vault: vaultPda,
      vaultAuthority,
      position,
      userAta: userAta.address,
      vaultAta: vaultAta.address
    });

    const depositIx = await buildDepositInstruction({
      program,
      amount: amountBn,
      accounts
    });

    const ixs = [...userAta.ixs, ...vaultAta.ixs, depositIx];
    return buildTransaction(ixs, payer);
  }

  async withdraw(params: WithdrawParams): Promise<Transaction> {
    const payer = this.client.payer();
    const amount = toBigIntAmount(params.amount);
    const amountBn = toBnU64(amount);

    const { address: vaultPda } = findVaultPda(this.client.programId, params.mint);
    const vaultExists = await getAccountExists(this.client.connection, vaultPda, this.client.commitment);
    if (!vaultExists) throw new VaultNotFoundError("Vault PDA account does not exist");

    const { address: vaultAuthority } = findVaultAuthorityPda(this.client.programId, vaultPda);
    const { address: position } = findUserPositionPda(this.client.programId, vaultPda, payer);

    const program = await this.client.program();

    const positionInfo = await this.client.connection.getAccountInfo(position, this.client.commitment);
    if (!positionInfo) {
      throw new TransactionBuildError("User position account does not exist; cannot withdraw");
    }
    if (!positionInfo.owner.equals(this.client.programId)) {
      throw new TransactionBuildError("User position account is not owned by the Pentarium program");
    }

    const decodedPosition = decodePositionAccount(program, positionInfo.data);
    const deposited = pickFirstU64LikeField(decodedPosition, POSITION_BALANCE_CANDIDATES);
    if (deposited === null) {
      throw new TransactionBuildError(
        "Unable to validate deposited balance from position account (missing recognizable balance field in IDL-decoded data)"
      );
    }
    if (amount > deposited) {
      throw new TransactionBuildError("Insufficient deposited balance for requested withdraw amount");
    }

    const userAta = await ensureAtaIxs({
      connection: this.client.connection,
      mint: params.mint,
      owner: payer,
      payer,
      allowOwnerOffCurve: false,
      commitment: this.client.commitment
    });

    const vaultAta = await ensureAtaIxs({
      connection: this.client.connection,
      mint: params.mint,
      owner: vaultAuthority,
      payer,
      allowOwnerOffCurve: true,
      commitment: this.client.commitment
    });

    const instructionName = program.idl.instructions.some((ix) => ix.name === "withdraw") ? "withdraw" : "withdraw";
    const accounts = resolveVaultAccountsForIdl({
      program,
      instructionName,
      user: payer,
      mint: params.mint,
      vault: vaultPda,
      vaultAuthority,
      position,
      userAta: userAta.address,
      vaultAta: vaultAta.address
    });

    const withdrawIx = await buildWithdrawInstruction({
      program,
      amount: amountBn,
      accounts
    });

    const ixs = [...userAta.ixs, ...vaultAta.ixs, withdrawIx];
    return buildTransaction(ixs, payer);
  }
}

function decodePositionAccount(program: Program<Idl>, data: Buffer): unknown {
  const idlAccounts = program.idl.accounts ?? [];
  const positionCandidates = idlAccounts
    .map((a) => a.name)
    .filter((n) => n.toLowerCase().includes("position"));

  const tryNames = positionCandidates.length > 0 ? positionCandidates : ["position", "Position", "UserPosition"];
  for (const name of tryNames) {
    try {
      return program.coder.accounts.decode(name, data);
    } catch {
      continue;
    }
  }
  throw new TransactionBuildError("Unable to decode position account with IDL (no matching account name)");
}
