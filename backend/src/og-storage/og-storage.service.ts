import {
  Injectable,
  Logger,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Indexer, MemData } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';

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
   * Uploads JSON data to 0G Storage.
   * @param data Any JSON-serializable object
   * @returns rootHash + tx info
   */
  async uploadJson(data: Record<string, any>): Promise<{
    rootHash: string;
    txHash: string;
    txSeq?: number;
    size: number;
    uploadedAt: string;
  }> {
    try {
      // 1. Serialize the JSON
      const serialized = JSON.stringify(data);
      const bytes = new TextEncoder().encode(serialized);
      this.logger.log(`Uploading ${bytes.length} bytes to 0G Storage...`);

      // 2. Wrap in MemData (in-memory data wrapper for 0G SDK)
      const memData = new MemData(bytes);

      // 3. Compute the Merkle tree to get the rootHash before upload
      const [tree, treeErr] = await memData.merkleTree();
      if (treeErr !== null || !tree) {
        throw new Error(`Merkle tree generation failed: ${String(treeErr)}`);
      }
      const rootHash = tree.rootHash() ?? '';
      this.logger.log(`Computed rootHash: ${rootHash}`);

      // 4. Upload to 0G Storage network
      const [tx, uploadErr] = await this.indexer.upload(
        memData,
        this.rpcUrl,
        this.signer,
      );
      if (uploadErr !== null) {
        throw new Error(`Upload failed: ${String(uploadErr)}`);
      }

      // 5. Parse SDK response
      const txResult = tx as unknown as UploadTxResult;
      const cleanTxHash = txResult?.txHash ?? '';
      const txSeq = txResult?.txSeq;

      this.logger.log(
        `Upload successful — txHash: ${cleanTxHash}, txSeq: ${txSeq}`,
      );

      return {
        rootHash,
        txHash: cleanTxHash,
        txSeq,
        size: bytes.length,
        uploadedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`uploadJson failed: ${message}`);
      throw new InternalServerErrorException(
        `0G Storage upload failed: ${message}`,
      );
    }
  }

  /**
   * Downloads JSON data from 0G Storage by its rootHash.
   * @param rootHash The unique identifier returned by uploadJson
   * @returns The original data parsed back to JSON
   */
  async downloadJson(rootHash: string): Promise<Record<string, any>> {
    try {
      this.logger.log(`Downloading from 0G Storage: ${rootHash}`);

      // SDK requires a file path for download in Node.js — use OS temp dir
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      const tempPath = path.join(os.tmpdir(), `0g-download-${Date.now()}.json`);

      // Download with merkle proof verification (true = verify integrity)
      const err = await this.indexer.download(rootHash, tempPath, true);
      if (err !== null) {
        throw new Error(`Download failed: ${String(err)}`);
      }

      // Read the downloaded file and parse JSON
      const content = fs.readFileSync(tempPath, 'utf-8');
      fs.unlinkSync(tempPath); // cleanup temp file

      const parsed = JSON.parse(content) as Record<string, any>;
      this.logger.log(`Successfully downloaded and parsed data`);
      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`downloadJson failed: ${message}`);
      throw new InternalServerErrorException(
        `0G Storage download failed: ${message}`,
      );
    }
  }
}
