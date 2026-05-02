import { Module } from '@nestjs/common';
import { TransactionEnricherService } from './transaction-enricher.service';

@Module({
  providers: [TransactionEnricherService],
  exports: [TransactionEnricherService], // expose for InftModule
})
export class TransactionEnricherModule {}
