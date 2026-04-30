import { Module } from '@nestjs/common';
import { LlmRouterService } from './llm-router.service';
import { OpenAIProvider } from './providers/openai.provider';
import { OgComputeProvider } from './providers/og-compute.provider';

@Module({
  providers: [LlmRouterService, OpenAIProvider, OgComputeProvider],
  exports: [LlmRouterService], // expose only the router to other modules
})
export class LlmModule {}
