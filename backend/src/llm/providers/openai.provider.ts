import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { LlmProvider } from '../interfaces/llm-provider.interface';
import { AnalysisResultDto, Verdict } from '../dto/analysis-result.dto';

@Injectable()
export class OpenAIProvider implements LlmProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAIProvider.name);
  private client: OpenAI | null = null;
  private readonly model = 'gpt-4o-mini';

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      this.logger.log(`OpenAI provider ready (model: ${this.model})`);
    } else {
      this.logger.warn('OPENAI_API_KEY not set — provider unavailable');
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async analyze(prompt: string): Promise<AnalysisResultDto> {
    if (!this.client) {
      throw new Error('OpenAI provider not configured');
    }

    const startTime = Date.now();

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a wallet security guardian AI. You analyze blockchain transactions and respond ONLY with a valid JSON object. Never include markdown code fences, never add explanations outside the JSON. The JSON must have exactly these fields: verdict (one of: SAFE, WARNING, DANGER), reason (1-2 sentences), confidence (number between 0 and 1).',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' }, // forces JSON output
      temperature: 0.3, // low temperature → consistent verdicts
    });

    const responseTimeMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error('OpenAI returned an empty response');
    }

    // Parse the JSON returned by GPT
    const parsed = JSON.parse(content) as {
      verdict?: string;
      reason?: string;
      confidence?: number;
    };

    // Validate the verdict matches expected enum
    const validVerdicts: Verdict[] = ['SAFE', 'WARNING', 'DANGER'];
    const verdict = validVerdicts.includes(parsed.verdict as Verdict)
      ? (parsed.verdict as Verdict)
      : 'WARNING'; // fallback if LLM returned something unexpected

    return {
      verdict,
      reason: parsed.reason ?? 'No reason provided',
      confidence:
        typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      providerUsed: this.name,
      responseTimeMs,
    };
  }
}
