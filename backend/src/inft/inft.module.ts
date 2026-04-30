import { Module } from '@nestjs/common';
import { InftService } from './inft.service';
import { InftController } from './inft.controller';
import { OgStorageModule } from '../og-storage/og-storage.module';

@Module({
  imports: [OgStorageModule], // ← important: pour pouvoir injecter OgStorageService
  controllers: [InftController],
  providers: [InftService],
})
export class InftModule {}
