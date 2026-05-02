import { ApiProperty } from '@nestjs/swagger';

export type TransactionType =
  | 'native_transfer' // ETH transfer (0G, BNB, etc.)
  | 'token_transfer' // ERC-20 transfer
  | 'token_approve' // ERC-20 approve
  | 'contract_interaction'; // generic contract call

export class AnalyzeTransactionDto {
  @ApiProperty({
    description: 'Type of transaction being analyzed',
    enum: [
      'native_transfer',
      'token_transfer',
      'token_approve',
      'contract_interaction',
    ],
    example: 'token_approve',
  })
  type!: TransactionType;

  // ─── For native_transfer ─────────────────────────────
  @ApiProperty({
    description:
      'Recipient wallet address (for native_transfer and token_transfer)',
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
    required: false,
  })
  recipient?: string;

  @ApiProperty({
    description:
      'Amount in wei (for native_transfer) or in token base units (for token_transfer)',
    example: '1000000000000000000',
    required: false,
  })
  amount?: string;

  // ─── For token_transfer / token_approve ──────────────
  @ApiProperty({
    description: 'ERC-20 token contract address',
    example: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    required: false,
  })
  tokenAddress?: string;

  @ApiProperty({
    description: 'Spender address (for token_approve)',
    example: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    required: false,
  })
  spender?: string;

  // ─── For contract_interaction (generic) ──────────────
  @ApiProperty({
    description: 'Contract address (for contract_interaction)',
    example: '0x...',
    required: false,
  })
  contractAddress?: string;

  @ApiProperty({
    description: 'Function signature being called (for contract_interaction)',
    example: 'mint(address,uint256)',
    required: false,
  })
  functionCall?: string;

  @ApiProperty({
    description: 'Decoded parameters (for contract_interaction)',
    example: { to: '0x...', amount: '100' },
    required: false,
  })
  params?: Record<string, string>;
}
