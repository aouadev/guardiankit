/**
 * Result of enriching a raw transaction with on-chain context.
 * This is what gets fed to the LLM for analysis.
 */
export interface EnrichedTransaction {
  // Raw input
  contractAddress: string;
  functionCall: string;
  params: Record<string, string>;

  // Enriched contract info
  contractInfo: {
    isVerified: boolean;
    contractName?: string; // e.g., "USDC", "UniswapV3SwapRouter"
    deployedAt?: string; // ISO timestamp of first transaction
    ageInDays?: number;
    txCount?: number; // total number of transactions
  };

  // Enriched spender info (if relevant — for approve, transferFrom)
  spenderInfo?: {
    address: string;
    isVerified: boolean;
    contractName?: string;
    deployedAt?: string;
    ageInDays?: number;
  };

  // Detected risk patterns
  riskFlags: {
    isUnlimitedApproval: boolean;
    isFreshContract: boolean; // < 7 days old
    isUnverifiedContract: boolean;
    isUnverifiedSpender: boolean;
    isFreshSpender: boolean;
  };

  // Human-readable summary for the LLM
  summary: string;
}
