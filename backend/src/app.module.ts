import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TransactionAnalyzerModule } from './transaction-analyzer/transaction-analyzer.module';
import { OgStorageModule } from './og-storage/og-storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TransactionAnalyzerModule,
    OgStorageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
