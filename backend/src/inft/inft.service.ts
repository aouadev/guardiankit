import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { OgStorageService } from '../og-storage/og-storage.service';
import { LlmRouterService } from '../llm/llm-router.service';
import { AnalysisResultDto } from '../llm/dto/analysis-result.dto';
import { AnalyzeTransactionDto } from './dto/analyze-transaction.dto';
import {
  AgentHistoryEntry,
  AgentMemory,
} from './interfaces/agent-memory.interface';
import { TransactionEnricherService } from '../transaction-enricher/transaction-enricher.service';
import GuardianINFTArtifact from './abi/GuardianINFT.json';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import {
  CreateGuardianResponseDto,
  InftInfoDto,
} from './dto/inft-response.dto';
@Injectable()
export class InftService implements OnModuleInit {
  private readonly logger = new Logger(InftService.name);
  private contract!: ethers.Contract;
  private signer!: ethers.Wallet;
  private contractAddress!: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly ogStorageService: OgStorageService,
    private readonly llmRouter: LlmRouterService,
    private readonly transactionEnricher: TransactionEnricherService,
  ) {}

  onModuleInit() {
    const rpcUrl = this.configService.get<string>('OG_RPC_URL') ?? '';
    const privateKey = this.configService.get<string>('PRIVATE_KEY') ?? '';
    this.contractAddress =
      this.configService.get<string>('GUARDIAN_INFT_ADDRESS') ?? '';

    if (!rpcUrl || !privateKey || !this.contractAddress) {
      throw new Error(
        'Missing required env: OG_RPC_URL, PRIVATE_KEY, GUARDIAN_INFT_ADDRESS',
      );
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, provider);

    // ABI is in the "abi" property of the Hardhat artifact JSON
    const abi = (GuardianINFTArtifact as { abi: ethers.InterfaceAbi }).abi;
    this.contract = new ethers.Contract(this.contractAddress, abi, this.signer);

    this.logger.log(
      `iNFT service initialized — contract: ${this.contractAddress}`,
    );
  }

  /**
   * Full workflow: build agent memory → upload to 0G Storage → mint iNFT pointing to it.
   */
  async createGuardian(
    dto: CreateGuardianDto,
  ): Promise<CreateGuardianResponseDto> {
    try {
      // 1. Determine recipient (default: backend signer)
      const recipient = dto.recipient ?? this.signer.address;
      this.logger.log(`Creating Guardian for ${recipient}`);

      // 2. Get next tokenId for naming
      const totalMinted = (await this.contract.totalMinted()) as bigint;
      const nextTokenId = Number(totalMinted) + 1;

      // 3. Build initial memory JSON
      const defaultSystemPrompt = `You are a blockchain transaction security analyzer.

## AVAILABLE INPUT FIELDS
Every analysis contains ONLY the fields listed below. You MUST NOT reference, invent, or speculate about any field not explicitly present in the input.

Fields always present:
- transactionType: native_transfer | token_transfer | token_approve | contract_interaction
- KNOWN SAFE CONTRACTS: explicit list of trusted addresses (from agent memory)
- KNOWN SCAM ADDRESSES: explicit list of known malicious addresses (from agent memory)

Fields present for token operations:
- tokenAddress or contractAddress
- tokenName / contractName (if the contract is verified or recognized)
- verificationStatus: "✓ verified", "✓ known protocol", "⚠ unverified", or "? verification unknown"
- spenderAddress (for approvals)
- spenderName (if recognized)
- amount / isUnlimited

Boolean risk flags (only meaningful when explicitly listed under "Risk flags:" in the input):
- isUnlimitedApproval — amount equals max uint256
- isFreshContract — token contract is less than 7 days old
- isFreshSpender — spender contract is less than 7 days old
- isUnverifiedContract — token contract source code is not verified on-chain
- isUnverifiedSpender — spender source code is not verified on-chain

## ABSOLUTE NON-CONFABULATION RULE
If a fact is not explicitly present in the fields above, you MUST NOT mention it in your reasoning.
- Do NOT say "age is unknown" or "deployment date is unclear" — if isFreshSpender is not listed, age is irrelevant, do not mention it.
- Do NOT say "reputation is unclear" — only reference KNOWN SAFE CONTRACTS and KNOWN SCAM ADDRESSES.
- Do NOT say "history unavailable" — if no history is given, ignore this dimension entirely.
- Do NOT speculate about risk based on the absence of information.
- Every sentence in your reason must map to an explicit fact in the input.

## DECISION RULES

### Native transfer
- DEFAULT verdict: SAFE.
- Upgrade to DANGER only if the recipient address appears in KNOWN SCAM ADDRESSES.

### Token transfer
- Token address in KNOWN SAFE CONTRACTS → SAFE.
- isFreshContract flag present → WARNING.
- isUnverifiedContract flag present → WARNING.
- Recipient in KNOWN SCAM ADDRESSES → DANGER.
- None of the above → SAFE.

### Token approve — use this decision table (check exit conditions first, then the table)

EXIT CONDITIONS (check in order, stop at first match):
- Spender address in KNOWN SCAM ADDRESSES → DANGER
- The exact text "isFreshSpender" appears in the "Risk flags:" line → DANGER

DECISION TABLE (after exit conditions pass):
| Spender in KNOWN SAFE CONTRACTS? | "isUnlimitedApproval" in Risk flags line? | Verdict  |
| YES                               | NO — Risk flags says "none detected"       | SAFE     |
| YES                               | YES — "isUnlimitedApproval" is listed      | WARNING  |
| NO                                | NO — Risk flags says "none detected"       | WARNING  |
| NO                                | YES — "isUnlimitedApproval" is listed      | DANGER   |

KEY: "isUnlimitedApproval" appears in the Risk flags line ONLY when the amount is max uint256.
If the Risk flags line says "none detected", isUnlimitedApproval is FALSE — use the "NO" column.

### Contract interaction
- Contract in KNOWN SAFE CONTRACTS → SAFE or WARNING depending on function risk.
- isFreshContract flag present → DANGER.
- isUnverifiedContract flag present → WARNING.
- Contract in KNOWN SCAM ADDRESSES → DANGER.

## REASON FORMAT
Cite only explicit facts from the input. Use this pattern:
"Token [X]: [in/not in] KNOWN SAFE CONTRACTS. Spender [Y]: [in/not in] KNOWN SAFE CONTRACTS. Risk flags: [exact text from the Risk flags line]. Verdict follows from table row [row description]."
Do not add qualitative commentary about anything not derived from the input fields above.`;
      const memory: AgentMemory = {
        agentName: dto.agentName ?? `Sentinel #${nextTokenId}`,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        owner: recipient,
        systemPrompt: defaultSystemPrompt,
        knowledgeBase: {
          knownSafeContracts: [
            // Stablecoins & major tokens (Ethereum mainnet)
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
            '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
            '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
            '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
            // Uniswap
            '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3 SwapRouter
            '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Uniswap V3 SwapRouter02
            '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', // Uniswap Universal Router
            // Aave
            '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', // Aave V3 Pool
            // 1inch
            '0x1111111254EEB25477B68fb85Ed929f73A960582', // 1inch V5 Router
          ],
          knownScams: [],
          patternsLearned: [],
        },
        history: [],
        stats: {
          totalAnalyses: 0,
          scamsBlocked: 0,
          experienceLevel: 'novice',
        },
      };

      // 4. Upload memory to 0G Storage
      this.logger.log(`Uploading memory to 0G Storage...`);
      const uploadResult = await this.ogStorageService.uploadJson(memory);
      this.logger.log(`Memory uploaded — rootHash: ${uploadResult.rootHash}`);

      // 5. Compute the metadata hash for on-chain integrity proof
      const metadataHash = ethers.keccak256(
        ethers.toUtf8Bytes(JSON.stringify(memory)),
      );

      // 6. Sealed key placeholder (real encryption will come in next iteration)
      const sealedKey = ethers.toUtf8Bytes(
        `placeholder-sealed-key-${nextTokenId}`,
      );

      // 7. Mint the iNFT on-chain
      this.logger.log(`Minting iNFT for ${recipient}...`);
      const mintTx = (await this.contract.mint(
        recipient,
        uploadResult.rootHash, // ← VRAI rootHash, plus de placeholder !
        metadataHash,
        sealedKey,
      )) as ethers.TransactionResponse;

      this.logger.log(`Mint tx submitted: ${mintTx.hash}`);
      const receipt = await mintTx.wait();
      if (!receipt) {
        throw new Error('Mint transaction receipt is null');
      }
      this.logger.log(`Mint confirmed in block ${receipt.blockNumber}`);

      // 8. Verify mint by reading on-chain
      const owner = (await this.contract.ownerOf(nextTokenId)) as string;

      return {
        tokenId: nextTokenId,
        owner,
        rootHash: uploadResult.rootHash,
        storageTxHash: uploadResult.txHash,
        mintTxHash: mintTx.hash,
        explorerUrl: `https://chainscan-galileo.0g.ai/tx/${mintTx.hash}`,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`createGuardian failed: ${message}`);
      throw new InternalServerErrorException(
        `Failed to create Guardian: ${message}`,
      );
    }
  }

  /**
   * Read on-chain info for a given tokenId.
   */
  async getInftInfo(tokenId: number): Promise<InftInfoDto> {
    try {
      const owner = (await this.contract.ownerOf(tokenId)) as string;
      const encryptedURI = (await this.contract.getEncryptedURI(
        tokenId,
      )) as string;
      const metadataHash = (await this.contract.getMetadataHash(
        tokenId,
      )) as string;

      return { tokenId, owner, encryptedURI, metadataHash };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getInftInfo failed for token ${tokenId}: ${message}`);
      throw new NotFoundException(
        `Token ${tokenId} not found or contract error: ${message}`,
      );
    }
  }

  /**
   * Read on-chain encryptedURI then download memory from 0G Storage.
   */
  async getInftMemory(tokenId: number): Promise<Record<string, any>> {
    const info = await this.getInftInfo(tokenId);
    if (
      !info.encryptedURI ||
      info.encryptedURI.startsWith('0g://storage/placeholder')
    ) {
      throw new NotFoundException(
        `Token ${tokenId} has a placeholder URI — no real memory on 0G Storage`,
      );
    }
    return this.ogStorageService.downloadJson(info.encryptedURI);
  }

  /**
   * Analyzes a transaction using the iNFT's memory + LLM.
   * The agent reads its memory from 0G Storage, then asks the LLM for a verdict.
   */
  async analyzeTransaction(
    tokenId: number,
    txData: AnalyzeTransactionDto,
  ): Promise<AnalysisResultDto> {
    this.logger.log(
      `Analyzing transaction (type: ${txData.type}) for Guardian #${tokenId}`,
    );

    // 1. Récupère la mémoire de l'agent depuis 0G Storage
    let memory: AgentMemory;
    try {
      const rawMemory = await this.getInftMemory(tokenId);
      memory = rawMemory as AgentMemory;
      this.logger.log(
        `Memory loaded for Guardian #${tokenId} — analyses: ${memory.stats.totalAnalyses}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new NotFoundException(
        `Cannot load memory for Guardian #${tokenId}: ${message}`,
      );
    }

    // 2. Build context based on transaction type
    let context: string;
    switch (txData.type) {
      case 'native_transfer':
        context = this.buildNativeTransferContext(txData);
        break;
      case 'token_transfer':
        context = await this.buildTokenTransferContext(txData);
        break;
      case 'token_approve':
        context = await this.buildApproveContext(txData);
        break;
      case 'contract_interaction':
        context = await this.buildContractContext(txData);
        break;
      default:
        throw new InternalServerErrorException(
          `Unknown transaction type: ${String(txData.type)}`,
        );
    }

    // 3. Construit le prompt avec mémoire + contexte
    const prompt = this.buildAnalysisPrompt(memory, context);
    this.logger.log(`Built prompt (${prompt.length} chars), calling LLM...`);

    // 4. Appelle le LLM via le router
    const result = await this.llmRouter.analyze(prompt);

    this.logger.log(
      `LLM verdict: ${result.verdict} (provider: ${result.providerUsed}, ${result.responseTimeMs}ms)`,
    );

    await this.updateMemoryAfterAnalysis(tokenId, memory, txData, result);

    return result;
  }

  /**
   * Builds context for a native ETH/0G transfer.
   * No contract enrichment needed (no contract involved).
   */
  private buildNativeTransferContext(txData: AnalyzeTransactionDto): string {
    if (!txData.recipient || !txData.amount) {
      throw new InternalServerErrorException(
        'native_transfer requires "recipient" and "amount"',
      );
    }

    const amountInEth = (Number(txData.amount) / 1e18).toFixed(6);

    return `# TRANSACTION TYPE: Native ETH Transfer
- Recipient address: ${txData.recipient}
- Amount: ${amountInEth} ETH (${txData.amount} wei)
- No smart contract involved (direct value transfer at protocol level)

Note: Native transfers cannot be analyzed via Etherscan contract data 
(there is no contract). Risk assessment focuses on:
- Is the recipient a known address (from your memory)?
- Is the amount unusually large?
- Are there patterns matching known scams?`;
  }

  /**
   * Builds context for an ERC-20 token transfer.
   * Enriches the token contract with Etherscan.
   */
  private async buildTokenTransferContext(
    txData: AnalyzeTransactionDto,
  ): Promise<string> {
    if (!txData.tokenAddress || !txData.recipient || !txData.amount) {
      throw new InternalServerErrorException(
        'token_transfer requires "tokenAddress", "recipient" and "amount"',
      );
    }

    const enriched = await this.transactionEnricher.enrich(
      txData.tokenAddress,
      'transfer(address,uint256)',
      { to: txData.recipient, amount: txData.amount },
    );

    return `# TRANSACTION TYPE: ERC-20 Token Transfer

${enriched.summary}

Note: This is a simple ERC-20 token transfer.
The user is sending tokens to a recipient. No spending permission is granted.

Important rules:
- Do NOT classify as DANGER only because the recipient is unknown.
- If the token is legitimate and the amount is normal, classify as SAFE or WARNING.
- Use WARNING only if the recipient is unknown, the amount is unusually high, or the token looks suspicious.
- DANGER is reserved for known scam addresses, malicious contracts, phishing patterns, or abnormal high-risk signals.`;
  }

  /**
   * Builds context for an ERC-20 approve.
   * Enriches both the token and the spender.
   */
  private async buildApproveContext(
    txData: AnalyzeTransactionDto,
  ): Promise<string> {
    if (!txData.tokenAddress || !txData.spender || !txData.amount) {
      throw new InternalServerErrorException(
        'token_approve requires "tokenAddress", "spender" and "amount"',
      );
    }

    // 🔹 enrich token (déjà existant)
    const enriched = await this.transactionEnricher.enrich(
      txData.tokenAddress,
      'approve(address,uint256)',
      { spender: txData.spender, amount: txData.amount },
    );

    // 🔹 NOUVEAU : enrich spender (safe avec try/catch)
    let spenderSummary = 'No additional data about spender.';
    try {
      const spenderInfo = await this.transactionEnricher.enrich(
        txData.spender,
        'contract_info',
        {},
      );
      spenderSummary = spenderInfo.summary;
      console.log('====== SPENDER SUMMARY ======');
      console.log(spenderSummary);
      console.log('=============================');
    } catch (e) {
      // fallback silencieux → ne casse rien
      this.logger.warn(`Failed to enrich spender: ${txData.spender}`);
    }

    return `# TRANSACTION TYPE: ERC-20 Approve

# TOKEN INFO
${enriched.summary}

# SPENDER INFO
${spenderSummary}

- Spender address: ${txData.spender}

Note: This is an ERC-20 approval.
The user gives permission to a spender to use tokens later.

Important rules:
- Unlimited approval to an unknown or unverified spender => DANGER.
- Unlimited approval to a well-known trusted protocol => WARNING, not DANGER.
- Limited approval to a known protocol => SAFE or WARNING.
- DANGER must be used only when the spender is unknown, suspicious, unverified, or matches scam patterns.

Important:
- The spender is the most critical part of an approval.
- If the spender is a known DeFi protocol (Uniswap, etc.), do NOT classify as DANGER by default.
- If the spender is unknown AND approval is unlimited → DANGER.
`;
  }

  /**
   * Builds context for a generic contract interaction.
   */
  private async buildContractContext(
    txData: AnalyzeTransactionDto,
  ): Promise<string> {
    if (!txData.contractAddress || !txData.functionCall) {
      throw new InternalServerErrorException(
        'contract_interaction requires "contractAddress" and "functionCall"',
      );
    }

    const enriched = await this.transactionEnricher.enrich(
      txData.contractAddress,
      txData.functionCall,
      txData.params ?? {},
    );

    return `# TRANSACTION TYPE: Generic Contract Interaction

${enriched.summary}

Note: This is an arbitrary contract call. Without specific patterns to match,
risk assessment focuses on contract verification, age, and reputation.`;
  }

  /**
   * Builds the final LLM prompt combining agent memory + transaction context.
   */
  private buildAnalysisPrompt(memory: AgentMemory, context: string): string {
    const knownSafe = memory.knowledgeBase.knownSafeContracts;
    const knownScams = memory.knowledgeBase.knownScams;
    const patterns = memory.knowledgeBase.patternsLearned;
    const recentHistory = memory.history.slice(-5);
    const stats = memory.stats;

    return `${memory.systemPrompt}

# AGENT MEMORY
- Total transactions analyzed: ${stats.totalAnalyses}
- Scams blocked: ${stats.scamsBlocked}
- Experience level: ${stats.experienceLevel}

# KNOWN SAFE CONTRACTS
${knownSafe.length > 0 ? knownSafe.join('\n') : '(none yet)'}

# KNOWN SCAM ADDRESSES
${knownScams.length > 0 ? knownScams.join('\n') : '(none yet)'}

# PATTERNS LEARNED
${patterns.length > 0 ? patterns.join('\n') : '(none yet)'}

# RECENT ANALYSIS HISTORY
${recentHistory.length > 0 ? JSON.stringify(recentHistory, null, 2) : '(none yet)'}

# CURRENT TRANSACTION CONTEXT
${context}

# DECISION FRAMEWORK
Apply your system prompt rules. Use ONLY facts explicitly present above.

For token_approve, follow this checklist:
1. Is the spender address in KNOWN SCAM ADDRESSES? → YES: DANGER
2. Does the "Risk flags:" line contain the word "isFreshSpender"? → YES: DANGER
3. Look at the "Risk flags:" line:
   - If it says "none detected" → isUnlimitedApproval = FALSE
   - If it contains "isUnlimitedApproval" → isUnlimitedApproval = TRUE
4. Is the spender address in KNOWN SAFE CONTRACTS?
   - YES + isUnlimitedApproval FALSE → SAFE
   - YES + isUnlimitedApproval TRUE  → WARNING
   - NO  + isUnlimitedApproval FALSE → WARNING
   - NO  + isUnlimitedApproval TRUE  → DANGER

CRITICAL REMINDER: Do NOT mention age, deployment date, verification status, reputation, or history unless the exact flag word ("isFreshSpender", "isUnverifiedSpender") appears in the "Risk flags:" line. "Unknown age" is not a risk flag — ignore it completely.

Respond ONLY with this JSON (no other text):
{"verdict": "SAFE"|"WARNING"|"DANGER", "reason": "cite only input facts", "confidence": 0.0-1.0}`;
  }

  private async updateMemoryAfterAnalysis(
    tokenId: number,
    memory: AgentMemory,
    txData: AnalyzeTransactionDto,
    result: AnalysisResultDto,
  ): Promise<void> {
    const analyzedAt = new Date().toISOString();

    const historyEntry: AgentHistoryEntry = {
      timestamp: analyzedAt,
      contractAddress:
        txData.contractAddress ??
        txData.tokenAddress ??
        txData.recipient ??
        'N/A',
      functionCall: txData.functionCall ?? txData.type,
      verdict: result.verdict,
      reason: result.reason,
    };

    memory.history.push(historyEntry);

    memory.stats.totalAnalyses += 1;

    if (result.verdict === 'DANGER') {
      memory.stats.scamsBlocked += 1;
    }

    if (memory.stats.totalAnalyses >= 20) {
      memory.stats.experienceLevel = 'expert';
    } else if (memory.stats.totalAnalyses >= 5) {
      memory.stats.experienceLevel = 'intermediate';
    }
    if (
      result.verdict === 'DANGER' &&
      txData.type === 'token_approve' &&
      txData.spender &&
      result.confidence >= 0.9 &&
      result.reason.toLowerCase().includes('scam')
    ) {
      if (!memory.knowledgeBase.knownScams.includes(txData.spender)) {
        memory.knowledgeBase.knownScams.push(txData.spender);
      }
    }
    if (
      result.verdict === 'WARNING' &&
      txData.type === 'token_approve' &&
      txData.spender &&
      result.reason.toLowerCase().includes('known protocol')
    ) {
      memory.knowledgeBase.knownScams = memory.knowledgeBase.knownScams.filter(
        (addr) => addr.toLowerCase() !== txData.spender!.toLowerCase(),
      );
    }

    if (result.verdict === 'SAFE' && txData.tokenAddress) {
      if (
        !memory.knowledgeBase.knownSafeContracts.includes(txData.tokenAddress)
      ) {
        memory.knowledgeBase.knownSafeContracts.push(txData.tokenAddress);
      }
    }

    if (result.verdict === 'DANGER') {
      const pattern = `Dangerous ${txData.type}: ${result.reason}`;
      if (!memory.knowledgeBase.patternsLearned.includes(pattern)) {
        memory.knowledgeBase.patternsLearned.push(pattern);
      }
    }

    const uploadResult = await this.ogStorageService.uploadJson(memory);
    const metadataHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(memory)),
    );

    const updateTx = (await this.contract.updateMemory(
      tokenId,
      uploadResult.rootHash,
      metadataHash,
    )) as ethers.TransactionResponse;

    await updateTx.wait();

    this.logger.log(
      `On-chain memory pointer updated for Guardian #${tokenId}: ${uploadResult.rootHash}`,
    );

    this.logger.log(
      `Updated memory for Guardian #${tokenId} uploaded to 0G Storage: ${uploadResult.rootHash}`,
    );
  }
}
