import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InftService } from './inft.service';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import {
  CreateGuardianResponseDto,
  InftInfoDto,
} from './dto/inft-response.dto';

@ApiTags('iNFT')
@Controller('inft')
export class InftController {
  private readonly logger = new Logger(InftController.name);

  constructor(private readonly inftService: InftService) {}

  @Post('create')
  @ApiOperation({
    summary: 'Create a new Guardian iNFT',
    description:
      'Full workflow: builds the agent memory, uploads it to 0G Storage, then mints an ERC-7857 iNFT pointing to that memory.',
  })
  @ApiResponse({
    status: 201,
    description: 'Guardian iNFT successfully created',
    type: CreateGuardianResponseDto,
  })
  async createGuardian(
    @Body() dto: CreateGuardianDto,
  ): Promise<CreateGuardianResponseDto> {
    this.logger.log(`Received create Guardian request`);
    return this.inftService.createGuardian(dto);
  }

  @Get(':tokenId')
  @ApiOperation({
    summary: 'Get on-chain info for an iNFT',
    description:
      'Returns owner, encryptedURI and metadataHash from the contract.',
  })
  @ApiParam({ name: 'tokenId', description: 'Token ID', example: 1 })
  @ApiResponse({ status: 200, type: InftInfoDto })
  async getInft(
    @Param('tokenId', ParseIntPipe) tokenId: number,
  ): Promise<InftInfoDto> {
    return this.inftService.getInftInfo(tokenId);
  }

  @Get(':tokenId/memory')
  @ApiOperation({
    summary: 'Get the full memory of an iNFT',
    description:
      'Reads the encryptedURI on-chain, then downloads the memory from 0G Storage.',
  })
  @ApiParam({ name: 'tokenId', description: 'Token ID', example: 2 })
  @ApiResponse({ status: 200, description: 'Memory JSON of the agent' })
  async getMemory(
    @Param('tokenId', ParseIntPipe) tokenId: number,
  ): Promise<Record<string, any>> {
    return this.inftService.getInftMemory(tokenId);
  }
}
