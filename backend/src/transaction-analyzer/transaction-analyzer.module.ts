import { Module } from '@nestjs/common';
import { TransactionAnalyzerController } from './transaction-analyzer.controller';
import { TransactionAnalyzerService } from './transaction-analyzer.service';

@Module({
  controllers: [TransactionAnalyzerController],
  providers: [TransactionAnalyzerService]
})
export class TransactionAnalyzerModule {}
