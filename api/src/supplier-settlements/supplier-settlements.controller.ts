import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../common/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../common/auth';
import { Roles, RolesGuard } from '../common/roles.guard';
import { CreateSupplierSettlementDto, UpdateSupplierDebtDto } from './supplier-settlements.dto';
import { SupplierSettlementsService } from './supplier-settlements.service';

@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.LEGAL_FINANCE)
@Controller('supplier-settlements')
export class SupplierSettlementsController {
  constructor(private readonly settlements: SupplierSettlementsService) {}

  @Get()
  list(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.settlements.list(page, pageSize);
  }

  @Post('products/:productId/settlements')
  create(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: CreateSupplierSettlementDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.settlements.create(productId, body, actor);
  }

  @Patch('products/:productId/debt')
  updateDebt(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: UpdateSupplierDebtDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.settlements.updateDebt(productId, body, actor);
  }
}
