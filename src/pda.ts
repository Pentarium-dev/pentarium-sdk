import { PublicKey } from "@solana/web3.js";
import {
  PENTARIUM_SEED_POSITION,
  PENTARIUM_SEED_VAULT,
  PENTARIUM_SEED_VAULT_AUTHORITY
} from "./constants";

export interface PdaResult {
  address: PublicKey;
  bump: number;
}

export function findVaultPda(programId: PublicKey, mint: PublicKey): PdaResult {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(PENTARIUM_SEED_VAULT), mint.toBuffer()],
    programId
  );
  return { address, bump };
}

export function findVaultAuthorityPda(programId: PublicKey, vaultPda: PublicKey): PdaResult {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(PENTARIUM_SEED_VAULT_AUTHORITY), vaultPda.toBuffer()],
    programId
  );
  return { address, bump };
}

export function findUserPositionPda(programId: PublicKey, vaultPda: PublicKey, user: PublicKey): PdaResult {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(PENTARIUM_SEED_POSITION), vaultPda.toBuffer(), user.toBuffer()],
    programId
  );
  return { address, bump };
}
