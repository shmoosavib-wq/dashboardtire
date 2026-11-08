import { Module } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({ controllers: [AuthController], providers: [AuthService, AuthGuard], exports: [AuthGuard] })
export class AuthModule {}
