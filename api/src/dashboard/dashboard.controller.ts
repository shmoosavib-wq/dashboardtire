import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../common/auth';
import { RolesGuard } from '../common/roles.guard';
import { DashboardService } from './dashboard.service';

@UseGuards(AuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(
    @Query('period') period: string | undefined,
    @Query('granularity') granularity: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.dashboard.summary(period, granularity, actor);
  }
}
