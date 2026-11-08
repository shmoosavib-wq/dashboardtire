import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const origin = request.headers.origin;
    const expectedOrigin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173';
    return typeof origin === 'string' && origin === expectedOrigin;
  }
}
