import { Module } from '@nestjs/common';
import { InftService } from './inft.service';
import { InftController } from './inft.controller';
import { OgStorageModule } from '../og-storage/og-storage.module';
import { LlmModule } from 'src/llm/llm.module';
import { TransactionEnricherModule } from 'src/transaction-enricher/transaction-enricher.module';

@Module({
  imports: [OgStorageModule, LlmModule, TransactionEnricherModule], // ← important: pour pouvoir injecter OgStorageService
  controllers: [InftController],
  providers: [InftService],
})
export class InftModule {}
