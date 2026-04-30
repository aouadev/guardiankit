import { ApiProperty } from '@nestjs/swagger';

export type Verdict = 'SAFE' | 'WARNING' | 'DANGER';

export class AnalysisResultDto {
  @ApiProperty({
    description: 'Risk verdict for the analyzed transaction',
    enum: ['SAFE', 'WARNING', 'DANGER'],
    example: 'WARNING',
  })
  verdict!: Verdict;

  @ApiProperty({
    description: 'Human-readable reasoning behind the verdict',
    example: 'Unlimited token approval to a contract less than 7 days old',
  })
  reason!: string;

  @ApiProperty({
    description: 'Confidence score (0-1) of the verdict',
    example: 0.85,
  })
  confidence!: number;

  @ApiProperty({
    description: 'Which LLM provider produced this result',
    example: 'openai',
  })
  providerUsed!: string;

  @ApiProperty({
    description: 'Response time in milliseconds',
    example: 1420,
  })
  responseTimeMs!: number;
}
