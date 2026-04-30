import { ApiProperty } from '@nestjs/swagger';

export class AnalyzeTransactionDto {
  @ApiProperty({
    description: 'Address of the contract being interacted with',
    example: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  })
  contractAddress!: string;

  @ApiProperty({
    description: 'Function being called (decoded from calldata)',
    example: 'approve(address,uint256)',
  })
  functionCall!: string;

  @ApiProperty({
    description: 'Value in wei being sent (0 for token interactions)',
    example: '0',
  })
  value!: string;

  @ApiProperty({
    description: 'Optional decoded parameters as a JSON string',
    example: '{"spender":"0xUniswapRouter","amount":"unlimited"}',
    required: false,
  })
  decodedParams?: string;

  @ApiProperty({
    description:
      'Optional context about the contract (age, verification status, etc.)',
    example: 'Verified contract, deployed 2 years ago, 1.2M txs',
    required: false,
  })
  contractContext?: string;
}
