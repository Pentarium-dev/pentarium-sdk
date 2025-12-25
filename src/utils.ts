import { BN } from "@coral-xyz/anchor";
import {
  Commitment,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, BPS_DENOMINATOR, SYSVAR_RENT_PUBKEY, TOKEN_PROGRAM_ID } from "./constants";
import { InvalidAmountError, SlippageExceededError, TransactionBuildError } from "./errors";

export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new TransactionBuildError(message);
}

export function toBigIntAmount(input: bigint | number | string): bigint {
  if (typeof input === "bigint") {
    if (input <= 0n) throw new InvalidAmountError("Amount must be > 0");
    return input;
  }

  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new InvalidAmountError("Amount must be finite");
    if (!Number.isInteger(input)) throw new InvalidAmountError("Amount must be an integer");
    if (input <= 0) throw new InvalidAmountError("Amount must be > 0");
    return BigInt(input);
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) throw new InvalidAmountError("Amount must be non-empty");
  if (!/^[0-9]+$/.test(trimmed)) throw new InvalidAmountError("Amount must be a base-10 integer string");
  const value = BigInt(trimmed);
  if (value <= 0n) throw new InvalidAmountError("Amount must be > 0");
  return value;
}

export function toBnU64(amount: bigint): BN {
  if (amount < 0n) throw new InvalidAmountError("Amount must be non-negative");
  const maxU64 = (1n << 64n) - 1n;
  if (amount > maxU64) throw new InvalidAmountError("Amount exceeds u64");
  return new BN(amount.toString(10));
}

export function validateSlippageBps(maxSlippageBps: number): void {
  if (!Number.isFinite(maxSlippageBps) || !Number.isInteger(maxSlippageBps)) {
    throw new SlippageExceededError("maxSlippageBps must be an integer");
  }
  if (maxSlippageBps < 0 || maxSlippageBps > BPS_DENOMINATOR) {
    throw new SlippageExceededError(`maxSlippageBps must be within [0, ${BPS_DENOMINATOR}]`);
  }
}

export async function getAccountExists(connection: Connection, address: PublicKey, commitment?: Commitment): Promise<boolean> {
  const info = await connection.getAccountInfo(address, commitment);
  return info !== null;
}

export function buildTransaction(instructions: ReadonlyArray<TransactionInstruction>, payer: PublicKey): Transaction {
  const tx = new Transaction();
  tx.feePayer = payer;
  for (const ix of instructions) tx.add(ix);
  return tx;
}

export function systemProgramId(): PublicKey {
  return SystemProgram.programId;
}

export function tokenProgramId(): PublicKey {
  return TOKEN_PROGRAM_ID;
}

export function associatedTokenProgramId(): PublicKey {
  return ASSOCIATED_TOKEN_PROGRAM_ID;
}

export function getAta(mint: PublicKey, owner: PublicKey, allowOwnerOffCurve: boolean): PublicKey {
  if (!allowOwnerOffCurve && !PublicKey.isOnCurve(owner.toBuffer())) {
    throw new TransactionBuildError("Owner is off-curve but allowOwnerOffCurve is false");
  }
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

export async function ensureAtaIxs(params: {
  connection: Connection;
  mint: PublicKey;
  owner: PublicKey;
  payer: PublicKey;
  allowOwnerOffCurve: boolean;
  commitment?: Commitment;
}): Promise<{ address: PublicKey; ixs: TransactionInstruction[] }> {
  const address = getAta(params.mint, params.owner, params.allowOwnerOffCurve);
  const exists = await getAccountExists(params.connection, address, params.commitment);
  if (exists) return { address, ixs: [] };

  const ix = createAssociatedTokenAccountIx({
    payer: params.payer,
    ata: address,
    owner: params.owner,
    mint: params.mint
  });
  return { address, ixs: [ix] };
}

export function createAssociatedTokenAccountIx(params: {
  payer: PublicKey;
  ata: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
}): TransactionInstruction {
  const keys = [
    { pubkey: params.payer, isSigner: true, isWritable: true },
    { pubkey: params.ata, isSigner: false, isWritable: true },
    { pubkey: params.owner, isSigner: false, isWritable: false },
    { pubkey: params.mint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
  ];

  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys,
    data: Buffer.alloc(0)
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function pickFirstU64LikeField(data: unknown, candidateKeys: ReadonlyArray<string>): bigint | null {
  if (!isRecord(data)) return null;

  for (const key of candidateKeys) {
    const v = data[key];
    const parsed = parseU64Like(v);
    if (parsed !== null) return parsed;
  }

  const entries = Object.entries(data);
  const u64Likes: bigint[] = [];
  for (const [, v] of entries) {
    const parsed = parseU64Like(v);
    if (parsed !== null) u64Likes.push(parsed);
  }

  if (u64Likes.length === 1) return u64Likes[0] ?? null;
  return null;
}

function parseU64Like(value: unknown): bigint | null {
  if (typeof value === "bigint") {
    if (value < 0n) return null;
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null;
    return BigInt(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^[0-9]+$/.test(trimmed)) return null;
    return BigInt(trimmed);
  }

  if (isRecord(value)) {
    const maybeBn = (value as Record<string, unknown>)["toString"];
    if (typeof maybeBn === "function") {
      try {
        const str = String((value as { toString: () => unknown }).toString());
        if (/^[0-9]+$/.test(str)) return BigInt(str);
      } catch {
        return null;
      }
    }
  }

  return null;
}
