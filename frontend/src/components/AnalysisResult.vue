<script setup lang="ts">
import type { TransactionAnalysisResult } from '@/types/transactionAnalysis'

defineProps<{
  result: TransactionAnalysisResult
}>()
</script>

<template>
  <div class="result">
    <h3>Analysis Result</h3>
    <p><strong>Network:</strong> {{ result.network }}</p>
    <p><strong>Status:</strong> {{ result.status }}</p>
    <p><strong>Risk Score:</strong> {{ result.riskScore }}/100</p>
    <p><strong>Summary:</strong> {{ result.summary }}</p>
    <p><strong>Recommendation:</strong> {{ result.recommendation }}</p>
  </div>
</template>
