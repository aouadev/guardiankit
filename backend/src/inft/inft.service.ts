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
      const memory = {
        agentName: dto.agentName ?? `Sentinel #${nextTokenId}`,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        owner: recipient,
        systemPrompt:
          dto.systemPrompt ??
          'You are a wallet guardian. Analyze transactions for safety and warn the user about scams, phishing contracts, and risky approvals.',
        knowledgeBase: {
          knownSafeContracts: [],
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
}
