import { Module } from '@nestjs/common';
import { OgStorageService } from './og-storage.service';
import { OgStorageController } from './og-storage.controller';

@Module({
  controllers: [OgStorageController],
  providers: [OgStorageService],
  exports: [OgStorageService], // Allow other modules (e.g., transaction-analyzer) to inject this service
})
export class OgStorageModule {}
