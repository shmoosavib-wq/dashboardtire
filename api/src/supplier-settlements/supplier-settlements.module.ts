import { Module } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { SupplierSettlementsController } from './supplier-settlements.controller';
import { SupplierSettlementsService } from './supplier-settlements.service';

@Module({
  controllers: [SupplierSettlementsController],
  providers: [SupplierSettlementsService, AuthGuard, RolesGuard],
})
export class SupplierSettlementsModule {}
