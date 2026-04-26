<script setup lang="ts">
defineProps<{
  account: string | null
}>()

defineEmits<{
  connect: []
}>()
</script>

<template>
  <div class="wallet">
    <button class="primary-btn" @click="$emit('connect')">
      {{ account ? 'Connected' : 'Connect Wallet' }}
    </button>

    <p v-if="account" class="address">Connected: {{ account }}</p>
  </div>
</template>
