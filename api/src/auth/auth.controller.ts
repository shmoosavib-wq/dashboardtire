import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '../common/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../common/auth';
import { LoginDto, SetupSuperAdminDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('setup-status')
  setupStatus() { return this.auth.setupStatus(); }

  @Post('bootstrap')
  bootstrap(@Body() body: SetupSuperAdminDto) { return this.auth.createFirstSuperAdmin(body); }

  @Post('login')
  login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) { return this.auth.login(body, response); }

  @Post('logout')
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) { return this.auth.logout(request.headers.cookie, response); }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) { return user; }
}
