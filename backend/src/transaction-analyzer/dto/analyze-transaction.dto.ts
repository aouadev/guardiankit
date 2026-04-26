import { ApiProperty } from '@nestjs/swagger';

export class AnalyzeTransactionDto {
  @ApiProperty({
    example: 'approve 0x123 unlimited',
    description: 'Transaction data or transaction description to analyze',
  })
  transactionData: string;
}
