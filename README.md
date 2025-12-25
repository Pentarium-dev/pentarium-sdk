# pentarium-sdk

Production-grade TypeScript SDK for the Pentarium Solana DeFi protocol.

This package is designed for integrators who need deterministic PDA derivation, strongly-typed transaction building, and Anchor-compatible program interaction.

## Runtime + Build Requirements

- Node.js >= 18
- TypeScript strict mode (the SDK compiles with `strict: true`)
- Solana libs: `@solana/web3.js`, `@coral-xyz/anchor`

## Install

```bash
npm i pentarium-sdk
```

## Package Contract

- No private keys are accepted or stored.
- Wallet must be compatible with Anchor’s signing interface.
- All PDAs are derived deterministically using `PublicKey.findProgramAddressSync`.
- SDK methods build deterministic instructions/transactions; oracle validation and pricing are assumed on-chain.

## Quick Start

```ts
import { Connection, PublicKey } from "@solana/web3.js";
import { PentariumClient } from "pentarium-sdk";

// Anchor-compatible wallet adapter
// Must implement: publicKey, signTransaction, signAllTransactions
import type { AnchorWallet } from "pentarium-sdk";

const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

const wallet: AnchorWallet = /* your wallet adapter */ null as unknown as AnchorWallet;

// Provide the REAL deployed Pentarium program id
const programId = new PublicKey(process.env.PENTARIUM_PROGRAM_ID!);

const pentarium = new PentariumClient({
	connection,
	wallet,
	programId
});

// Build a deposit transaction (no send is performed here)
const tx = await pentarium.vault.deposit({
	mint: new PublicKey(process.env.SPL_MINT!),
	amount: 1_000_000n
});

// Optionally send with the built-in sender
// const sig = await pentarium.send(tx);
```

## Deterministic PDA Specification

All PDA helpers are exported from [src/pda.ts](src/pda.ts).

### Vault PDA

- Seeds: `["vault", mint]`

```ts
import { findVaultPda } from "pentarium-sdk";

const { address: vaultPda, bump } = findVaultPda(programId, mint);
```

### Vault Authority PDA

- Seeds: `["vault_authority", vaultPda]`

```ts
import { findVaultAuthorityPda } from "pentarium-sdk";

const { address: vaultAuthorityPda } = findVaultAuthorityPda(programId, vaultPda);
```

### User Position PDA

- Seeds: `["position", vaultPda, userPubkey]`

```ts
import { findUserPositionPda } from "pentarium-sdk";

const { address: positionPda } = findUserPositionPda(programId, vaultPda, user);
```

## Client Model

### `new PentariumClient({ connection, wallet, programId, commitment?, idl? })`

- Validates `wallet.publicKey` is non-null.
- Constructs an Anchor `AnchorProvider`.
- Loads the Program via on-chain IDL fetch.
	- If your deployment does not publish IDL on-chain, pass `idl` explicitly.

### Wallet Interface

The SDK accepts an `AnchorWallet` (exported type) with:

- `publicKey: PublicKey | null`
- `signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>`
- `signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>`

## Vault Module

Entry point: `pentarium.vault`

### Discover

```ts
const { vaultPda, vaultAuthorityPda } = await pentarium.vault.discover(mint);
```

### Deposit

```ts
const tx = await pentarium.vault.deposit({ mint, amount });
```

Behavioral guarantees:

- Validates `amount > 0`.
- Derives PDAs deterministically.
- Ensures user ATA exists (creates it if absent).
- Ensures vault ATA exists (creates it if absent) with `allowOwnerOffCurve = true`.
- Builds the Anchor instruction using the loaded IDL.
- Returns a fully built `Transaction` with deterministic instruction ordering:
	1) Create user ATA (if needed)
	2) Create vault ATA (if needed)
	3) Deposit instruction

### Withdraw

```ts
const tx = await pentarium.vault.withdraw({ mint, amount });
```

Behavioral guarantees:

- Validates `amount > 0`.
- Fetches and IDL-decodes the user position account.
- Enforces `amount <= deposited` using checked arithmetic (u64 boundary + bigint compare).
- Uses deterministic account ordering as defined by the IDL + SDK mapping.

## Swap Module (Oracle-Priced)

Entry point: `pentarium.swap`

### Execute

```ts
const tx = await pentarium.swap.execute({
	fromMint,
	toMint,
	amount,
	maxSlippageBps
});
```

Rules:

- No AMM curve math.
- No off-chain pricing.
- Slippage is enforced via input validation only (`0 <= maxSlippageBps <= 10_000`).
- Oracle validation and price execution is assumed to happen on-chain.
- Deterministic instruction ordering:
	1) Create user ATA(s) if needed
	2) Create vault ATA(s) if needed
	3) Swap instruction

## Yield Module (Read-Only)

Entry point: `pentarium.yield`

### `getOptimalRoutes(mint)`

```ts
const result = await pentarium.yield.getOptimalRoutes(mint);
// result.vault
// result.routes
// result.rawVaultAccount
```

### `getVaultAllocation(mint)`

```ts
const result = await pentarium.yield.getVaultAllocation(mint);
// result.vault
// result.allocation
// result.rawVaultAccount
```

Both methods:

- Require the vault PDA account to exist.
- Enforce the vault account is owned by the Pentarium program.
- Decode the vault via the loaded IDL coder.

## Deterministic ATA Derivation

ATA derivation is done deterministically via the associated token program PDA:

- Seeds: `[owner, TOKEN_PROGRAM_ID, mint]`
- Program: `ASSOCIATED_TOKEN_PROGRAM_ID`

Constants are exported:

- `TOKEN_PROGRAM_ID`
- `ASSOCIATED_TOKEN_PROGRAM_ID`

## Error Taxonomy

All errors are explicit, developer-readable, and thrown synchronously/asynchronously (never silent):

- `WalletNotConnectedError`
- `InvalidAmountError`
- `VaultNotFoundError`
- `SlippageExceededError`
- `TransactionBuildError`

## Transaction Sending

The SDK exposes a convenience sender:

```ts
const sig = await pentarium.send(tx);
```

This:

- Fetches a recent blockhash at the client’s configured commitment
- Sets `feePayer`
- Signs via wallet adapter
- Sends raw transaction bytes

Integrators can also sign/send using their own pipeline.

## Exports

From `pentarium-sdk`:

- `PentariumClient`
- PDA helpers: `findVaultPda`, `findVaultAuthorityPda`, `findUserPositionPda`
- Error classes
- Public types (wallet + request types)

Note: The module namespace export for yield is `yieldSdk` (not `yield`) to avoid reserved-word collisions in strict mode.
