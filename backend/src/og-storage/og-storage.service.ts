import {
  Injectable,
  Logger,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Indexer, MemData } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Result returned by indexer.upload() in @0gfoundation/0g-ts-sdk v1.2.6
 */
interface UploadTxResult {
  txHash: string;
  rootHash: string;
  txSeq: number;
}

@Injectable()
export class OgStorageService implements OnModuleInit {
  private readonly logger = new Logger(OgStorageService.name);
  private indexer!: Indexer;
  private signer!: ethers.Wallet;
  private rpcUrl!: string;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initializes the 0G Storage SDK on module startup.
   * Reads RPC, indexer URL, and private key from .env via ConfigService.
   */
  onModuleInit() {
    this.rpcUrl = this.configService.get<string>('OG_RPC_URL') ?? '';
    const indexerUrl = this.configService.get<string>('OG_INDEXER_URL') ?? '';
    const privateKey = this.configService.get<string>('PRIVATE_KEY') ?? '';

    if (!this.rpcUrl || !indexerUrl || !privateKey) {
      throw new Error(
        'Missing required env: OG_RPC_URL, OG_INDEXER_URL, PRIVATE_KEY',
      );
    }

    const provider = new ethers.JsonRpcProvider(this.rpcUrl);
    this.signer = new ethers.Wallet(privateKey, provider);
    this.indexer = new Indexer(indexerUrl);

    this.logger.log(`0G Storage initialized — wallet: ${this.signer.address}`);
  }

  /**
   * Saves a local copy of data under local-storage/<rootHash>.json.
   * Called before every 0G upload so there is always a local backup.
   */
  saveLocalCopy(rootHash: string, data: Record<string, any>): void {
    const dir = path.join(process.cwd(), 'local-storage');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, `${rootHash}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    this.logger.log(`Local memory saved at: ${filePath}`);
  }

  /**
   * Uploads JSON data to 0G Storage with a local backup written first.
   * Falls back to local-only mode if 0G upload fails or times out.
   */
  async uploadJson(data: Record<string, any>): Promise<{
    rootHash: string;
    txHash: string;
    txSeq?: number;
    size: number;
    uploadedAt: string;
    storageMode: '0g' | 'local';
  }> {
    // 1. Serialize the JSON
    const serialized = JSON.stringify(data);
    const bytes = new TextEncoder().encode(serialized);
    this.logger.log(`Uploading ${bytes.length} bytes to 0G Storage...`);

    // 2. Wrap in MemData
    const memData = new MemData(bytes);

    // 3. Compute the Merkle tree to get the rootHash
    const [tree, treeErr] = await memData.merkleTree();
    if (treeErr !== null || !tree) {
      throw new InternalServerErrorException(
        `Merkle tree generation failed: ${String(treeErr)}`,
      );
    }
    const rootHash = tree.rootHash() ?? '';
    this.logger.log(`Computed rootHash: ${rootHash}`);

    // 4. Save local copy BEFORE attempting 0G upload
    this.saveLocalCopy(rootHash, data);

    // 5. Attempt 0G upload with timeout
    try {
      const [tx, uploadErr] = await this.withTimeout(
        this.indexer.upload(memData, this.rpcUrl, this.signer),
        30000,
      );
      if (uploadErr !== null) {
        throw new Error(`Upload failed: ${String(uploadErr)}`);
      }

      const txResult = tx as unknown as UploadTxResult;
      const cleanTxHash = txResult?.txHash ?? '';
      const txSeq = txResult?.txSeq;

      this.logger.log(
        `Storage mode: 0G — txHash: ${cleanTxHash}, txSeq: ${txSeq}`,
      );

      return {
        rootHash,
        txHash: cleanTxHash,
        txSeq,
        size: bytes.length,
        uploadedAt: new Date().toISOString(),
        storageMode: '0g',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `0G Storage upload failed, using local fallback: ${message}`,
      );
      this.logger.warn(`Storage mode: LOCAL`);

      return {
        rootHash,
        txHash: `local-${rootHash}`,
        txSeq: undefined,
        size: bytes.length,
        uploadedAt: new Date().toISOString(),
        storageMode: 'local',
      };
    }
  }

  /**
   * Downloads JSON data from 0G Storage, falling back to local file if needed.
   */
  async downloadJson(rootHash: string): Promise<Record<string, any>> {
    // 1. Try 0G Storage first
    try {
      this.logger.log(`Downloading from 0G Storage: ${rootHash}`);

      const os = await import('os');
      const tempPath = path.join(os.tmpdir(), `0g-download-${Date.now()}.json`);

      const err = await this.indexer.download(rootHash, tempPath, true);
      if (err !== null) {
        throw new Error(`Download failed: ${String(err)}`);
      }

      const content = fs.readFileSync(tempPath, 'utf-8');
      fs.unlinkSync(tempPath);

      this.logger.log(`Storage mode: 0G — download successful`);
      return JSON.parse(content) as Record<string, any>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`0G download failed, using local fallback: ${message}`);
    }

    // 2. Fall back to local file
    const localPath = path.join(
      process.cwd(),
      'local-storage',
      `${rootHash}.json`,
    );
    if (fs.existsSync(localPath)) {
      const content = fs.readFileSync(localPath, 'utf-8');
      this.logger.log(`Storage mode: LOCAL — reading from ${localPath}`);
      return JSON.parse(content) as Record<string, any>;
    }

    throw new InternalServerErrorException(
      `Memory not found for rootHash ${rootHash} (0G failed, no local backup)`,
    );
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`0G Storage timeout after ${ms / 1000}s`)),
          ms,
        ),
      ),
    ]);
  }
}
