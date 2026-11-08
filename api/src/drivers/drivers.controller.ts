import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { WorkflowStage } from '@prisma/client';
import { AuthGuard } from '../common/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../common/auth';
import { RolesGuard } from '../common/roles.guard';
import { ArchiveDriverDto, CreateDriverDto, SaveDraftDto, StoreSettlementDto, WorkflowActionDto } from './drivers.dto';
import { DriversService } from './drivers.service';
import { stageLabels } from './workflow';

@UseGuards(AuthGuard, RolesGuard)
@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get('meta')
  meta() { return { stages: stageLabels }; }

  @Get('stage-counts')
  stageCounts() { return this.drivers.stageCounts(); }

  @Get()
  list(@Query('search') search?: string, @Query('stage') stage?: WorkflowStage, @Query('archived') archived?: string) {
    return this.drivers.list({ search, stage, archived });
  }

  @Post()
  create(@Body() body: CreateDriverDto, @CurrentUser() actor: AuthenticatedUser) { return this.drivers.create(body, actor); }

  @Get(':id')
  detail(@Param('id') id: string) { return this.drivers.detail(id); }

  @Patch(':id/draft')
  saveDraft(@Param('id') id: string, @Body() body: SaveDraftDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.drivers.saveDraft(id, body, actor);
  }

  @Post(':id/actions')
  action(@Param('id') id: string, @Body() body: WorkflowActionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.drivers.action(id, body, actor);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string, @Body() body: ArchiveDriverDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.drivers.archive(id, body, actor);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.drivers.restore(id, actor);
  }

  @Post(':id/store-settlement')
  settleStore(@Param('id') id: string, @Body() body: StoreSettlementDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.drivers.settleStore(id, body, actor);
  }
}
