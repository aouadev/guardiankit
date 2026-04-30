import { Injectable, Logger } from '@nestjs/common';
import { LlmProvider } from '../interfaces/llm-provider.interface';
import { AnalysisResultDto } from '../dto/analysis-result.dto';

/**
 * 0G Compute provider — stub implementation.
 * Will be fully implemented in next iteration using @0glabs/0g-serving-broker.
 */
@Injectable()
export class OgComputeProvider implements LlmProvider {
  readonly name = '0g-compute';
  private readonly logger = new Logger(OgComputeProvider.name);

  isAvailable(): boolean {
    // Disabled for now — will return true once implementation is ready
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/require-await
  async analyze(prompt: string): Promise<AnalysisResultDto> {
    throw new Error('0G Compute provider not yet implemented');
  }
}
