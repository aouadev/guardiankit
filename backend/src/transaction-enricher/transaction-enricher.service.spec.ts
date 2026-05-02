import { Test, TestingModule } from '@nestjs/testing';
import { TransactionEnricherService } from './transaction-enricher.service';
import { ConfigService } from '@nestjs/config';

describe('TransactionEnricherService', () => {
  let service: TransactionEnricherService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionEnricherService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(''),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionEnricherService>(
      TransactionEnricherService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
