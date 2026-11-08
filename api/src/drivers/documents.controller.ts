import { BadRequestException, Controller, Delete, Get, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { AuthGuard } from '../common/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../common/auth';
import { Roles, RolesGuard } from '../common/roles.guard';
import { UploadDocumentDto } from './drivers.dto';
import { DocumentsService } from './documents.service';

@UseGuards(AuthGuard, RolesGuard)
@Controller('drivers/:driverId/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: Number(process.env.MAX_VIDEO_BYTES || 157286400), files: 1 },
  }))
  upload(
    @Param('driverId') driverId: string,
    @Query() query: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!query.category) throw new BadRequestException('دستهٔ مدرک مشخص نشده است.');
    return this.documents.upload(driverId, query, file, actor);
  }

  @Delete(':documentId')
  @Roles('SALES_OPERATIONS')
  remove(
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.documents.remove(driverId, documentId, actor);
  }

  @Get(':documentId/download')
  download(
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.documents.download(driverId, documentId, actor, response);
  }
}
