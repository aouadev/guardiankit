import { Body, Controller, Get, Logger, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OgStorageService } from './og-storage.service';
import { UploadDataDto, UploadResponseDto } from './dto/upload-data.dto';

@ApiTags('0G Storage')
@Controller('og-storage')
export class OgStorageController {
  private readonly logger = new Logger(OgStorageController.name);

  constructor(private readonly ogStorageService: OgStorageService) {}

  @Post('upload')
  @ApiOperation({
    summary: 'Upload JSON data to 0G Storage',
    description:
      'Uploads any JSON-serializable data to the decentralized 0G Storage network. Returns a rootHash that can be used later to retrieve the data.',
  })
  @ApiResponse({
    status: 201,
    description: 'Data successfully uploaded to 0G Storage',
    type: UploadResponseDto,
  })
  async upload(@Body() dto: UploadDataDto): Promise<UploadResponseDto> {
    this.logger.log(`Received upload request`);
    return this.ogStorageService.uploadJson(dto.data);
  }

  @Get('download/:rootHash')
  @ApiOperation({
    summary: 'Download JSON data from 0G Storage',
    description:
      'Retrieves data previously uploaded to 0G Storage by its rootHash.',
  })
  @ApiParam({
    name: 'rootHash',
    description: 'The unique identifier returned by the upload endpoint',
    example:
      '0x9bc60c68479601b2b4e51ae99fa46cca95a01d4a3e6700c3f5b94a36e8db2212',
  })
  @ApiResponse({
    status: 200,
    description: 'Data successfully retrieved',
  })
  async download(
    @Param('rootHash') rootHash: string,
  ): Promise<Record<string, any>> {
    this.logger.log(`Received download request for ${rootHash}`);
    return this.ogStorageService.downloadJson(rootHash);
  }
}
