import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../common/auth.guard';
import { CurrentUser, Roles, type AuthenticatedUser } from '../common/auth';
import { RolesGuard } from '../common/roles.guard';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get() list() { return this.users.list(); }

  @Post() create(@Body() body: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) { return this.users.create(body, actor); }

  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.update(id, body, actor);
  }

  @Post(':id/reset-password') resetPassword(@Param('id') id: string, @Body() body: ResetPasswordDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.resetPassword(id, body, actor);
  }
}
