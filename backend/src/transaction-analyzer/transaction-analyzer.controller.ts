import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { TransactionAnalyzerService } from './transaction-analyzer.service';
import { AnalyzeTransactionDto } from './dto/analyze-transaction.dto';

@ApiTags('TransactionAnalyzer')
@Controller('transaction-analyzer')
export class TransactionAnalyzerController {
  constructor(
    private readonly transactionAnalyzerService: TransactionAnalyzerService,
  ) {}

  @Post('analyze')
  @ApiBody({ type: AnalyzeTransactionDto })
  analyzeTransaction(@Body() body: AnalyzeTransactionDto) {
    return this.transactionAnalyzerService.analyze(body.transactionData);
  }
}
