import { Test, TestingModule } from '@nestjs/testing';
import { TransactionAnalyzerService } from './transaction-analyzer.service';

describe('TransactionAnalyzerService', () => {
  let service: TransactionAnalyzerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransactionAnalyzerService],
    }).compile();

    service = module.get<TransactionAnalyzerService>(TransactionAnalyzerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
