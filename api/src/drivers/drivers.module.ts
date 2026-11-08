import { Module } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  controllers: [DriversController, DocumentsController],
  providers: [DriversService, DocumentsService, AuthGuard, RolesGuard],
})
export class DriversModule {}
