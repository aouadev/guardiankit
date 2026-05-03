# GuardianKit — AI Wallet Guardian

**ETHGlobal Open Agents hackathon project.**

GuardianKit is an AI-powered wallet security system where each guardian agent lives as an **ERC-7857 intelligent NFT (iNFT)** on [0G Chain](https://0g.ai). The agent's memory is stored on 0G Storage and evolves with every transaction it analyzes — learning scam patterns, safe contracts, and building an experience level over time.

---

## How it works

```
User submits a transaction → Backend loads agent memory from 0G Storage
  → Enriches with Etherscan data → LLM analysis (OpenAI / 0G Compute)
  → SAFE / WARNING / DANGER verdict → Memory updated on 0G Storage + on-chain pointer updated
```

Each Guardian iNFT carries:
- An **encrypted memory URI** pointing to its state on 0G Storage (agent name, history, known safe contracts, known scams, patterns learned)
- A **metadata hash** for on-chain integrity verification
- A **sealed key** per authorized address (ERC-7857 re-encryption on transfer)

---

## Architecture

```
guardiankit/
├── contracts/   Hardhat — GuardianINFT.sol (ERC-7857), MockOracle.sol
├── backend/     NestJS — API, LLM router, 0G Storage, Etherscan enrichment
└── frontend/    Vue 3 + Vite — wallet connect, sentinel management, analysis UI
```

### Backend modules (`backend/src/`)

| Module | Role |
|---|---|
| `inft/` | Core orchestrator: mint, analyze, evolving memory |
| `llm/` | Multi-provider router — OpenAI (primary) → 0G Compute (fallback) |
| `og-storage/` | 0G Storage SDK: upload/download JSON by Merkle root hash, local fallback |
| `transaction-enricher/` | Etherscan V2: contract verification, age, known protocols, risk flags |

### Smart contract (`contracts/contracts/GuardianINFT.sol`)

ERC-721 + ERC-7857 extension:
- `mint(to, encryptedURI, metadataHash, sealedKey)`
- `secureTransfer(...)` — oracle-verified transfer with memory re-encryption
- `authorizeUsage(tokenId, executor, permissions)` — delegate without transfer
- `updateMemory(tokenId, newEncryptedURI, newMetadataHash)` — called after each analysis

---

## Deployed contracts — 0G Galileo Testnet (Chain ID: 16602)

| Contract | Address |
|---|---|
| GuardianINFT | [`0xD94819E5540f8fa8229D5e7dC9726146FAAe06ba`](https://chainscan-galileo.0g.ai/address/0xD94819E5540f8fa8229D5e7dC9726146FAAe06ba) |
| MockOracle | [`0x61368E641806D8BFd8f7f884B5B450f1805986d0`](https://chainscan-galileo.0g.ai/address/0x61368E641806D8BFd8f7f884B5B450f1805986d0) |

> MockOracle accepts any non-empty proof — not for production.

---

## Prerequisites

- Node.js ≥ 20
- A wallet private key with 0G Galileo testnet funds (for gas + 0G Storage)
- OpenAI API key (or 0G Compute endpoint)
- Etherscan API key (for contract enrichment)

---

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in the values below
npm run start:dev
```

**Required `.env`:**

```env
OG_RPC_URL=https://evmrpc-testnet.0g.ai
OG_INDEXER_URL=https://indexer-storage-testnet-standard.0g.ai
PRIVATE_KEY=0x...                          # wallet that signs txs and mints iNFTs
GUARDIAN_INFT_ADDRESS=0xD94819E5540f8fa8229D5e7dC9726146FAAe06ba
MOCK_ORACLE_ADDRESS=0x61368E641806D8BFd8f7f884B5B450f1805986d0

OPENAI_API_KEY=sk-...
LLM_PRIMARY=openai                         # or: 0g-compute
LLM_TIMEOUT_MS=10000

ETHERSCAN_API_KEY=...
ETHERSCAN_BASE_URL=https://api.etherscan.io/v2/api
ETHERSCAN_CHAIN_ID=1
```

Swagger UI available at `http://localhost:3000/api`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`. Requires MetaMask.

### 3. Contracts (optional — already deployed)

```bash
cd contracts
npm install
npx hardhat test
```

To redeploy:

```bash
npx hardhat run scripts/deploy.ts --network galileo
```

---

## API reference

| Method | Route | Description |
|---|---|---|
| `POST` | `/inft/create` | Mint a new Guardian iNFT |
| `GET` | `/inft/:tokenId` | On-chain info (owner, encryptedURI, hash) |
| `GET` | `/inft/:tokenId/memory` | Full agent memory from 0G Storage |
| `POST` | `/inft/:tokenId/analyze` | Analyze a transaction |

### Analyze payload

```json
{ "type": "native_transfer", "recipient": "0x...", "amount": "10000000000000000" }
{ "type": "token_transfer",  "tokenAddress": "0x...", "recipient": "0x...", "amount": "1000000" }
{ "type": "token_approve",   "tokenAddress": "0x...", "spender": "0x...", "amount": "115792...935" }
{ "type": "contract_interaction", "contractAddress": "0x...", "functionCall": "transfer(address,uint256)" }
```

### Analysis response

```json
{
  "verdict": "SAFE" | "WARNING" | "DANGER",
  "reason": "Token 0xA0b8…: in KNOWN SAFE CONTRACTS. Spender 0xE592…: in KNOWN SAFE CONTRACTS. Risk flags: none detected.",
  "confidence": 0.95,
  "providerUsed": "openai",
  "responseTimeMs": 1420
}
```

---

## Agent memory structure

Each iNFT stores a JSON object on 0G Storage:

```json
{
  "agentName": "Sentinel Prime",
  "version": "1.0.0",
  "owner": "0x...",
  "systemPrompt": "...",
  "knowledgeBase": {
    "knownSafeContracts": ["0xA0b8...", "0xE592...", "..."],
    "knownScams": [],
    "patternsLearned": []
  },
  "history": [
    { "timestamp": "...", "contractAddress": "0x...", "verdict": "SAFE", "reason": "..." }
  ],
  "stats": {
    "totalAnalyses": 12,
    "scamsBlocked": 2,
    "experienceLevel": "intermediate"
  }
}
```

New agents are bootstrapped with 9 known-safe addresses (USDC, USDT, DAI, WETH, Uniswap V3 SwapRouter, SwapRouter02, Universal Router, Aave V3 Pool, 1inch V5 Router).

---

## Storage resilience

`OgStorageService` implements dual storage:
1. **Local backup** written before every 0G upload (`backend/local-storage/<rootHash>.json`)
2. **0G upload** with a 30-second timeout
3. **Download fallback**: if 0G download fails, reads the local backup

The API never blocks on 0G Storage failures.

---

## ERC-7857 — Intelligent NFT standard

GuardianINFT implements the key primitives of the draft ERC-7857 standard:
- **Encrypted memory URI** — agent state is never stored in plain text on-chain
- **Sealed keys** — per-address encryption keys enable selective access
- **Secure transfer** — oracle verifies re-encryption proof before ownership changes
- **Usage authorization** — owner can grant execution rights without transferring the NFT
