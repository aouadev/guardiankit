import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TransactionAnalyzerModule } from './transaction-analyzer/transaction-analyzer.module';

@Module({
  imports: [TransactionAnalyzerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
