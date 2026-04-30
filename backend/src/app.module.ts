import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TransactionAnalyzerModule } from './transaction-analyzer/transaction-analyzer.module';
import { OgStorageModule } from './og-storage/og-storage.module';
import { InftService } from './inft/inft.service';
import { InftController } from './inft/inft.controller';
import { InftModule } from './inft/inft.module';
import { LlmModule } from './llm/llm.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TransactionAnalyzerModule,
    OgStorageModule,
    InftModule,
    LlmModule,
  ],
  controllers: [AppController, InftController],
  providers: [AppService, InftService],
})
export class AppModule {}
