import { BadRequestException, Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../common/auth.guard';
import { Roles, RolesGuard } from '../common/roles.guard';
import { AuditQueryService } from './audit.service';

@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  list(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query('q') q?: string,
    @Query('category') category?: string,
  ) {
    if (q && q.length > 120) throw new BadRequestException('عبارت جست‌وجو حداکثر ۱۲۰ نویسه است.');
    if (category && !['workflow', 'documents', 'users', 'settlements', 'archive'].includes(category)) {
      throw new BadRequestException('دسته رویداد معتبر نیست.');
    }
    return this.audit.list({ page, pageSize, q, category });
  }
}
