import { ApiProperty } from '@nestjs/swagger';

export class CreateGuardianResponseDto {
  @ApiProperty({
    description: 'Token ID of the newly minted Guardian iNFT',
    example: 2,
  })
  tokenId!: number;

  @ApiProperty({
    description: 'Owner address of the iNFT',
    example: '0xfdaC...',
  })
  owner!: string;

  @ApiProperty({
    description: 'rootHash of the encrypted memory on 0G Storage',
    example: '0x...',
  })
  rootHash!: string;

  @ApiProperty({
    description: 'Storage upload tx hash on 0G Chain',
    example: '0x...',
  })
  storageTxHash!: string;

  @ApiProperty({
    description: 'Mint transaction hash on 0G Chain',
    example: '0x...',
  })
  mintTxHash!: string;

  @ApiProperty({ description: 'Block explorer URL for the mint transaction' })
  explorerUrl!: string;

  @ApiProperty({ description: 'ISO timestamp of creation' })
  createdAt!: string;
}

export class InftInfoDto {
  @ApiProperty({ description: 'Token ID', example: 1 })
  tokenId!: number;

  @ApiProperty({ description: 'Current owner address' })
  owner!: string;

  @ApiProperty({
    description: 'Encrypted URI pointing to memory on 0G Storage',
  })
  encryptedURI!: string;

  @ApiProperty({
    description: 'Hash of the metadata for integrity verification',
  })
  metadataHash!: string;
}
