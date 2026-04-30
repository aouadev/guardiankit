import { AnalysisResultDto } from '../dto/analysis-result.dto';

/**
 * Common interface that all LLM providers must implement.
 * This abstraction lets us swap providers (OpenAI, 0G Compute, Anthropic, ...)
 * without changing the consumer code.
 */
export interface LlmProvider {
  /**
   * Unique identifier of this provider (e.g. 'openai', '0g-compute').
   */
  readonly name: string;

  /**
   * Returns true if the provider is properly configured and ready to use.
   * Used by the router to skip providers that lack credentials/setup.
   */
  isAvailable(): boolean;

  /**
   * Sends a prompt to the LLM and returns a structured analysis result.
   * The provider is responsible for parsing the LLM output into the standard format.
   */
  analyze(prompt: string): Promise<AnalysisResultDto>;
}
