import {
  AnchorProvider,
  type Idl,
  Program,
} from "@coral-xyz/anchor";
import type {
  Commitment,
  Connection,
  PublicKey,
  SendOptions,
  TransactionSignature,
  VersionedTransaction
} from "@solana/web3.js";
import { Transaction } from "@solana/web3.js";
import { DEFAULT_COMMITMENT } from "./constants";
import { TransactionBuildError, WalletNotConnectedError } from "./errors";
import type { AnchorWallet, PentariumClientOptions } from "./types";
import { VaultClient } from "./vault/vault.client";
import { SwapClient } from "./swap/swap.client";
import { YieldClient } from "./yield/yield.client";

export class PentariumClient {
  readonly connection: Connection;
  readonly wallet: AnchorWallet;
  readonly programId: PublicKey;
  readonly commitment: Commitment;
  readonly provider: AnchorProvider;

  readonly vault: VaultClient;
  readonly swap: SwapClient;
  readonly yield: YieldClient;

  private readonly programPromise: Promise<Program<Idl>>;

  constructor(options: PentariumClientOptions) {
    const programId = options.programId;
    const connection = options.connection;
    const wallet = options.wallet;
    const commitment = options.commitment ?? DEFAULT_COMMITMENT;

    this.connection = connection;
    this.wallet = wallet;
    this.programId = programId;
    this.commitment = commitment;

    const payer = this.wallet.publicKey;
    if (!payer) throw new WalletNotConnectedError();

    const signTransaction = async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      return await this.wallet.signTransaction(tx);
    };
    const signAllTransactions = async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      return await this.wallet.signAllTransactions(txs);
    };

    const anchorWallet = { publicKey: payer, signTransaction, signAllTransactions };

    const provider = new AnchorProvider(this.connection, anchorWallet, {
      commitment: this.commitment,
      preflightCommitment: this.commitment
    });
    this.provider = provider;

    this.programPromise = (async () => {
      const idl = options.idl ?? (await Program.fetchIdl(programId, provider));
      if (!idl) {
        throw new TransactionBuildError(
          "Unable to load IDL for programId. Provide options.idl or ensure the program publishes its IDL on-chain."
        );
      }
      return new Program<Idl>(idl, provider);
    })();

    this.vault = new VaultClient(this);
    this.swap = new SwapClient(this);
    this.yield = new YieldClient(this);
  }

  async program(): Promise<Program<Idl>> {
    return await this.programPromise;
  }

  payer(): PublicKey {
    const pk = this.wallet.publicKey;
    if (!pk) throw new WalletNotConnectedError();
    return pk;
  }

  async send(transaction: Transaction, options?: SendOptions): Promise<TransactionSignature> {
    const payer = this.payer();
    transaction.feePayer = payer;
    const latest = await this.connection.getLatestBlockhash(this.commitment);
    transaction.recentBlockhash = latest.blockhash;
    const signed = await this.wallet.signTransaction(transaction);
    const raw = signed.serialize();
    return await this.connection.sendRawTransaction(raw, options);
  }
}
