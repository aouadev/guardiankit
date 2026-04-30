import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from './interfaces/llm-provider.interface';
import { OpenAIProvider } from './providers/openai.provider';
import { OgComputeProvider } from './providers/og-compute.provider';
import { AnalysisResultDto } from './dto/analysis-result.dto';

@Injectable()
export class LlmRouterService implements OnModuleInit {
  private readonly logger = new Logger(LlmRouterService.name);
  private primaryProvider!: LlmProvider;
  private fallbackProvider!: LlmProvider;
  private timeoutMs!: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly openaiProvider: OpenAIProvider,
    private readonly ogComputeProvider: OgComputeProvider,
  ) {}

  onModuleInit() {
    const primaryName =
      this.configService.get<string>('LLM_PRIMARY') ?? 'openai';
    this.timeoutMs =
      Number(this.configService.get<string>('LLM_TIMEOUT_MS')) || 10000;

    // Determine primary and fallback based on config
    if (primaryName === '0g-compute' && this.ogComputeProvider.isAvailable()) {
      this.primaryProvider = this.ogComputeProvider;
      this.fallbackProvider = this.openaiProvider;
    } else {
      this.primaryProvider = this.openaiProvider;
      this.fallbackProvider = this.ogComputeProvider;
    }

    this.logger.log(
      `LLM Router initialized — primary: ${this.primaryProvider.name}, fallback: ${this.fallbackProvider.name}, timeout: ${this.timeoutMs}ms`,
    );
  }

  /**
   * Tries the primary provider first (with timeout), falls back to secondary if it fails.
   */
  async analyze(prompt: string): Promise<AnalysisResultDto> {
    // Attempt 1 — Primary provider
    if (this.primaryProvider.isAvailable()) {
      try {
        this.logger.log(
          `Trying primary provider: ${this.primaryProvider.name}`,
        );
        return await this.withTimeout(
          this.primaryProvider.analyze(prompt),
          this.timeoutMs,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Primary provider ${this.primaryProvider.name} failed: ${message}. Trying fallback...`,
        );
      }
    }

    // Attempt 2 — Fallback provider
    if (this.fallbackProvider.isAvailable()) {
      try {
        this.logger.log(
          `Trying fallback provider: ${this.fallbackProvider.name}`,
        );
        return await this.fallbackProvider.analyze(prompt);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Fallback provider ${this.fallbackProvider.name} also failed: ${message}`,
        );
        throw new Error(`All LLM providers failed. Last error: ${message}`);
      }
    }

    throw new Error('No LLM provider is available. Check your configuration.');
  }

  /**
   * Wraps a promise in a timeout. Rejects if the promise doesn't resolve within `timeoutMs`.
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Provider timeout after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }
}
