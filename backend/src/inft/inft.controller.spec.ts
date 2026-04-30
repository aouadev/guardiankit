import { Test, TestingModule } from '@nestjs/testing';
import { InftController } from './inft.controller';

describe('InftController', () => {
  let controller: InftController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InftController],
    }).compile();

    controller = module.get<InftController>(InftController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
