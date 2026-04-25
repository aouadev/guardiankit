import { Test, TestingModule } from '@nestjs/testing';
import { TransactionAnalyzerController } from './transaction-analyzer.controller';

describe('TransactionAnalyzerController', () => {
  let controller: TransactionAnalyzerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionAnalyzerController],
    }).compile();

    controller = module.get<TransactionAnalyzerController>(TransactionAnalyzerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
