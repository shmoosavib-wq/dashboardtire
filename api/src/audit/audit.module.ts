import { Module } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { AuditController } from './audit.controller';
import { AuditQueryService } from './audit.service';

@Module({ controllers: [AuditController], providers: [AuditQueryService, AuthGuard, RolesGuard] })
export class AuditModule {}
