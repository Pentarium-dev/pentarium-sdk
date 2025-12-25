import type { PublicKey, Transaction } from "@solana/web3.js";
import { VaultNotFoundError } from "../errors";
import { findVaultAuthorityPda, findVaultPda } from "../pda";
import type { SwapExecuteParams } from "../types";
import { buildTransaction, ensureAtaIxs, getAccountExists, toBigIntAmount, toBnU64, validateSlippageBps } from "../utils";
import type { PentariumClient } from "../client";
import { buildSwapInstruction, resolveSwapAccountsForIdl } from "./swap.instructions";

export class SwapClient {
  private readonly client: PentariumClient;
  constructor(client: PentariumClient) {
    this.client = client;
  }

  async execute(params: SwapExecuteParams): Promise<Transaction> {
    const payer = this.client.payer();
    const amount = toBigIntAmount(params.amount);
    validateSlippageBps(params.maxSlippageBps);
    const amountBn = toBnU64(amount);

    const { address: fromVault } = findVaultPda(this.client.programId, params.fromMint);
    const { address: toVault } = findVaultPda(this.client.programId, params.toMint);

    const fromVaultExists = await getAccountExists(this.client.connection, fromVault, this.client.commitment);
    if (!fromVaultExists) throw new VaultNotFoundError("From-vault does not exist");
    const toVaultExists = await getAccountExists(this.client.connection, toVault, this.client.commitment);
    if (!toVaultExists) throw new VaultNotFoundError("To-vault does not exist");

    const { address: fromVaultAuthority } = findVaultAuthorityPda(this.client.programId, fromVault);
    const { address: toVaultAuthority } = findVaultAuthorityPda(this.client.programId, toVault);

    const userFromAta = await ensureAtaIxs({
      connection: this.client.connection,
      mint: params.fromMint,
      owner: payer,
      payer,
      allowOwnerOffCurve: false,
      commitment: this.client.commitment
    });
    const userToAta = await ensureAtaIxs({
      connection: this.client.connection,
      mint: params.toMint,
      owner: payer,
      payer,
      allowOwnerOffCurve: false,
      commitment: this.client.commitment
    });

    const fromVaultAta = await ensureAtaIxs({
      connection: this.client.connection,
      mint: params.fromMint,
      owner: fromVaultAuthority,
      payer,
      allowOwnerOffCurve: true,
      commitment: this.client.commitment
    });
    const toVaultAta = await ensureAtaIxs({
      connection: this.client.connection,
      mint: params.toMint,
      owner: toVaultAuthority,
      payer,
      allowOwnerOffCurve: true,
      commitment: this.client.commitment
    });

    const program = await this.client.program();
    const ixName = program.idl.instructions.find((ix) => ["execute", "executeSwap", "swap"].includes(ix.name))?.name;
    if (!ixName) {
      throw new VaultNotFoundError("IDL missing swap instruction (execute/executeSwap/swap)");
    }

    const accounts = resolveSwapAccountsForIdl({
      program,
      instructionName: ixName,
      user: payer,
      fromMint: params.fromMint,
      toMint: params.toMint,
      fromVault,
      toVault,
      fromVaultAuthority,
      toVaultAuthority,
      userFromAta: userFromAta.address,
      userToAta: userToAta.address,
      fromVaultAta: fromVaultAta.address,
      toVaultAta: toVaultAta.address
    });

    const swapIx = await buildSwapInstruction({
      program,
      amount: amountBn,
      maxSlippageBps: params.maxSlippageBps,
      accounts
    });

    const ixs = [...userFromAta.ixs, ...userToAta.ixs, ...fromVaultAta.ixs, ...toVaultAta.ixs, swapIx];
    return buildTransaction(ixs, payer);
  }
}
