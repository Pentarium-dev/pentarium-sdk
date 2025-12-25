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

function normalizeKey(name: string): string {
  return name.replace(/[_-]/g, "").toLowerCase();
}

function findInstructionName(program: Program<Idl>, allowed: ReadonlyArray<string>): string {
  const idlIxNames = new Set(program.idl.instructions.map((ix) => ix.name));
  for (const candidate of allowed) {
    if (idlIxNames.has(candidate)) return candidate;
  }
  throw new TransactionBuildError(`IDL is missing required swap instruction: one of [${allowed.join(", ")}]`);
}

export function resolveSwapAccountsForIdl(params: {
  program: Program<Idl>;
  instructionName: string;
  user: PublicKey;
  fromMint: PublicKey;
  toMint: PublicKey;
  fromVault: PublicKey;
  toVault: PublicKey;
  fromVaultAuthority: PublicKey;
  toVaultAuthority: PublicKey;
  userFromAta: PublicKey;
  userToAta: PublicKey;
  fromVaultAta: PublicKey;
  toVaultAta: PublicKey;
}): Record<string, PublicKey> {
  const idlIx = params.program.idl.instructions.find((ix) => ix.name === params.instructionName);
  if (!idlIx) throw new TransactionBuildError(`Instruction ${params.instructionName} not found in IDL`);

  const resolved: Record<string, PublicKey> = {};
  for (const acc of idlIx.accounts) {
    const n = normalizeKey(acc.name);

    if (n === "user" || n === "trader" || n === "authority" || n === "owner" || n === "payer") {
      resolved[acc.name] = params.user;
      continue;
    }

    if (n === "frommint" || n === "inputmint" || n === "mintin") {
      resolved[acc.name] = params.fromMint;
      continue;
    }
    if (n === "tomint" || n === "outputmint" || n === "mintout") {
      resolved[acc.name] = params.toMint;
      continue;
    }

    if (n === "fromvault" || n === "inputvault" || n === "vaultin") {
      resolved[acc.name] = params.fromVault;
      continue;
    }
    if (n === "tovault" || n === "outputvault" || n === "vaultout") {
      resolved[acc.name] = params.toVault;
      continue;
    }

    if (n === "fromvaultauthority" || n === "inputvaultauthority" || n === "vaultauthorityin") {
      resolved[acc.name] = params.fromVaultAuthority;
      continue;
    }
    if (n === "tovaultauthority" || n === "outputvaultauthority" || n === "vaultauthorityout") {
      resolved[acc.name] = params.toVaultAuthority;
      continue;
    }

    if (n === "userfromtokenaccount" || n === "userfromata" || n === "inputuserata" || n === "fromuserata") {
      resolved[acc.name] = params.userFromAta;
      continue;
    }
    if (n === "usertotokenaccount" || n === "usertoata" || n === "outputuserata" || n === "touserata") {
      resolved[acc.name] = params.userToAta;
      continue;
    }

    if (n === "fromvaulttokenaccount" || n === "fromvaultata" || n === "inputvaultata") {
      resolved[acc.name] = params.fromVaultAta;
      continue;
    }
    if (n === "tovaulttokenaccount" || n === "tovaultata" || n === "outputvaultata") {
      resolved[acc.name] = params.toVaultAta;
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
      `Unsupported IDL account '${acc.name}' for swap instruction '${params.instructionName}'. SDK needs an explicit mapping for this account name.`
    );
  }

  return resolved;
}

export async function buildSwapInstruction(params: {
  program: Program<Idl>;
  amount: BN;
  maxSlippageBps: number;
  accounts: Record<string, PublicKey>;
}): Promise<TransactionInstruction> {
  const ixName = findInstructionName(params.program, ["execute", "executeSwap", "swap"]);
  const method = getMethods(params.program)[ixName];
  if (!method) throw new TransactionBuildError(`Anchor methods missing '${ixName}'`);

  return await method(params.amount, params.maxSlippageBps).accounts(params.accounts).instruction();
}
