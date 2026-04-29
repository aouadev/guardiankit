import { ApiProperty } from '@nestjs/swagger';

export class UploadDataDto {
  @ApiProperty({
    description: 'Any JSON-serializable data to upload to 0G Storage',
    example: { agentName: 'Sentinel #1', test: true },
  })
  data!: Record<string, any>;
}

export class UploadResponseDto {
  @ApiProperty({
    description:
      'Unique identifier of the uploaded data on 0G Storage (Merkle root hash)',
    example:
      '0x9bc60c68479601b2b4e51ae99fa46cca95a01d4a3e6700c3f5b94a36e8db2212',
  })
  rootHash!: string;

  @ApiProperty({
    description: 'Blockchain transaction hash on 0G Chain',
    example:
      '0x2758609f123636eacab5ab15c12f4ef95aef451c5d147143eed09b110914acc9',
  })
  txHash!: string;

  @ApiProperty({
    description: 'Sequence number on 0G Storage network',
    required: false,
    example: 56143,
  })
  txSeq?: number;

  @ApiProperty({
    description: 'Size of the uploaded data in bytes',
    example: 39,
  })
  size!: number;

  @ApiProperty({
    description: 'ISO timestamp of the upload',
    example: '2026-04-29T10:45:49.224Z',
  })
  uploadedAt!: string;
}
