import type { Idl, Program } from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, SYSVAR_RENT_PUBKEY, TOKEN_PROGRAM_ID } from "../constants";
import { TransactionBuildError } from "../errors";

type AnchorMethodBuilder = {
  accounts: (accounts: Record<string, PublicKey>) => {
    instruction: () => Promise<TransactionInstruction>;
  };
};

type AnchorMethods = Record<string, (...args: unknown[]) => AnchorMethodBuilder>;

function getMethods(program: Program<Idl>): AnchorMethods {
  return program.methods as unknown as AnchorMethods;
}

function findInstructionName(program: Program<Idl>, allowed: ReadonlyArray<string>): string {
  const idlIxNames = new Set(program.idl.instructions.map((ix) => ix.name));
  for (const candidate of allowed) {
    if (idlIxNames.has(candidate)) return candidate;
  }
  throw new TransactionBuildError(`IDL is missing required instruction: one of [${allowed.join(", ")}]`);
}

function normalizeKey(name: string): string {
  return name.replace(/[_-]/g, "").toLowerCase();
}

export function resolveVaultAccountsForIdl(params: {
  program: Program<Idl>;
  instructionName: string;
  user: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  vaultAuthority: PublicKey;
  position: PublicKey;
  userAta: PublicKey;
  vaultAta: PublicKey;
}): Record<string, PublicKey> {
  const idlIx = params.program.idl.instructions.find((ix) => ix.name === params.instructionName);
  if (!idlIx) throw new TransactionBuildError(`Instruction ${params.instructionName} not found in IDL`);

  const resolved: Record<string, PublicKey> = {};
  for (const acc of idlIx.accounts) {
    const n = normalizeKey(acc.name);
    if (n === "user" || n === "depositor" || n === "authority" || n === "owner" || n === "payer") {
      resolved[acc.name] = params.user;
      continue;
    }
    if (n === "mint") {
      resolved[acc.name] = params.mint;
      continue;
    }
    if (n === "vault") {
      resolved[acc.name] = params.vault;
      continue;
    }
    if (n === "vaultauthority" || n === "vaultauth") {
      resolved[acc.name] = params.vaultAuthority;
      continue;
    }
    if (n === "position" || n === "userposition") {
      resolved[acc.name] = params.position;
      continue;
    }
    if (n === "usertokenaccount" || n === "userata" || n === "from" || n === "fromata") {
      resolved[acc.name] = params.userAta;
      continue;
    }
    if (n === "vaulttokenaccount" || n === "vaultata" || n === "to" || n === "toata") {
      resolved[acc.name] = params.vaultAta;
      continue;
    }
    if (n === "tokenprogram") {
      resolved[acc.name] = TOKEN_PROGRAM_ID;
      continue;
    }
    if (n === "associatedtokenprogram") {
      resolved[acc.name] = ASSOCIATED_TOKEN_PROGRAM_ID;
      continue;
    }
    if (n === "systemprogram") {
      resolved[acc.name] = SystemProgram.programId;
      continue;
    }
    if (n === "rent") {
      resolved[acc.name] = SYSVAR_RENT_PUBKEY;
      continue;
    }

    throw new TransactionBuildError(
      `Unsupported IDL account '${acc.name}' for instruction '${params.instructionName}'. SDK needs an explicit mapping for this account name.`
    );
  }

  return resolved;
}

export async function buildDepositInstruction(params: {
  program: Program<Idl>;
  amount: BN;
  accounts: Record<string, PublicKey>;
}): Promise<TransactionInstruction> {
  const ixName = findInstructionName(params.program, ["deposit"]);
  const method = getMethods(params.program)[ixName];
  if (!method) throw new TransactionBuildError(`Anchor methods missing '${ixName}'`);
  return await method(params.amount).accounts(params.accounts).instruction();
}

export async function buildWithdrawInstruction(params: {
  program: Program<Idl>;
  amount: BN;
  accounts: Record<string, PublicKey>;
}): Promise<TransactionInstruction> {
  const ixName = findInstructionName(params.program, ["withdraw"]);
  const method = getMethods(params.program)[ixName];
  if (!method) throw new TransactionBuildError(`Anchor methods missing '${ixName}'`);
  return await method(params.amount).accounts(params.accounts).instruction();
}
