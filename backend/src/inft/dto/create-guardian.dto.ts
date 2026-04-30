import { ApiProperty } from '@nestjs/swagger';

export class CreateGuardianDto {
  @ApiProperty({
    description:
      'Wallet address that will receive the iNFT (defaults to backend signer if omitted)',
    example: '0xfdaC8C070B0DD9eA9444EeC1a6492F742046d877',
    required: false,
  })
  recipient?: string;

  @ApiProperty({
    description: 'Custom agent name (defaults to "Sentinel #N")',
    example: 'My Custom Sentinel',
    required: false,
  })
  agentName?: string;

  @ApiProperty({
    description:
      'Custom system prompt for the AI guardian (defaults to standard prompt)',
    example: 'You are a vigilant wallet guardian focused on DeFi risks.',
    required: false,
  })
  systemPrompt?: string;
}
