import { PublicKey } from "@solana/web3.js";

export const PENTARIUM_SEED_VAULT = "vault";
export const PENTARIUM_SEED_VAULT_AUTHORITY = "vault_authority";
export const PENTARIUM_SEED_POSITION = "position";

export const BPS_DENOMINATOR = 10_000;

export const DEFAULT_COMMITMENT: "processed" | "confirmed" | "finalized" = "confirmed";

export const SYSVAR_RENT_PUBKEY = new PublicKey("SysvarRent111111111111111111111111111111111");

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
