import { Test, TestingModule } from '@nestjs/testing';
import { InftService } from './inft.service';

describe('InftService', () => {
  let service: InftService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InftService],
    }).compile();

    service = module.get<InftService>(InftService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
