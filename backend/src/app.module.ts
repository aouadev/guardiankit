import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OgStorageModule } from './og-storage/og-storage.module';
import { InftService } from './inft/inft.service';
import { InftController } from './inft/inft.controller';
import { InftModule } from './inft/inft.module';
import { LlmModule } from './llm/llm.module';
import { TransactionEnricherModule } from './transaction-enricher/transaction-enricher.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    OgStorageModule,
    InftModule,
    LlmModule,
    TransactionEnricherModule,
  ],
  controllers: [AppController, InftController],
  providers: [AppService, InftService],
})
export class AppModule {}
