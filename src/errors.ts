export class PentariumError extends Error {
  override name: string = "PentariumError";
  constructor(message: string) {
    super(message);
  }
}

export class WalletNotConnectedError extends PentariumError {
  override name: string = "WalletNotConnectedError";
  constructor() {
    super("Wallet is not connected (missing publicKey)");
  }
}

export class InvalidAmountError extends PentariumError {
  override name: string = "InvalidAmountError";
  constructor(message = "Invalid amount") {
    super(message);
  }
}

export class VaultNotFoundError extends PentariumError {
  override name: string = "VaultNotFoundError";
  constructor(message = "Vault not found for the given mint") {
    super(message);
  }
}

export class SlippageExceededError extends PentariumError {
  override name: string = "SlippageExceededError";
  constructor(message = "Slippage constraints violated") {
    super(message);
  }
}

export class TransactionBuildError extends PentariumError {
  override name: string = "TransactionBuildError";
  constructor(message = "Failed to build transaction") {
    super(message);
  }
}
