<script setup lang="ts">
import { RouterView, RouterLink } from 'vue-router'
import { useWalletStore } from '@/stores/wallet'

const wallet = useWalletStore()
</script>

<template>
  <nav class="navbar">
    <RouterLink to="/" class="brand">🛡️ GuardianKit</RouterLink>
    <div class="nav-links">
      <RouterLink to="/" class="nav-link">My Sentinels</RouterLink>
    </div>
    <button class="btn btn-primary nav-wallet" @click="wallet.connect()">
      {{
        wallet.account
          ? `${wallet.account.slice(0, 6)}…${wallet.account.slice(-4)}`
          : 'Connect Wallet'
      }}
    </button>
  </nav>
  <main>
    <RouterView />
  </main>
</template>

<!-- Global styles (non-scoped) -->
<style>
:root {
  --bg: #020617;
  --bg-card: #0f172a;
  --border: #334155;
  --text: #f1f5f9;
  --muted: #94a3b8;
  --blue: #3b82f6;
  --safe: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, sans-serif;
  min-height: 100vh;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: opacity 0.15s;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn:not(:disabled):hover {
  opacity: 0.85;
}
.btn-primary {
  background: var(--blue);
  color: white;
}
.btn-secondary {
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid var(--border);
}
</style>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 24px;
  height: 56px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}
.brand {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
  text-decoration: none;
}
.nav-links {
  display: flex;
  gap: 16px;
}
.nav-link {
  color: var(--muted);
  font-size: 0.9rem;
  text-decoration: none;
  transition: color 0.15s;
}
.nav-link:hover,
.nav-link.router-link-active {
  color: var(--text);
}
.nav-wallet {
  margin-left: auto;
  font-size: 0.85rem;
  padding: 7px 14px;
  font-family: monospace;
}
main {
  min-height: calc(100vh - 56px);
}
</style>
