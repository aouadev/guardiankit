import { Body, Controller, Post } from '@nestjs/common';
import { TransactionAnalyzerService } from './transaction-analyzer.service';

@Controller('transaction-analyzer')
export class TransactionAnalyzerController {
  constructor(
    private readonly transactionAnalyzerService: TransactionAnalyzerService,
  ) {}

  @Post('analyze')
  analyzeTransaction(@Body() body: { transactionData: string }) {
    return this.transactionAnalyzerService.analyze(body.transactionData);
  }
}
