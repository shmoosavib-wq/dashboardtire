import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';

function readSessionCookie(request: Request): string | null {
  const raw = request.headers.cookie;
  if (!raw) return null;
  const entry = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith('sababar_session='));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice('sababar_session='.length));
  } catch {
    return null;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = readSessionCookie(request);
    if (!token) throw new UnauthorizedException();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, name: true, username: true, roles: true, isActive: true } } },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.isActive) throw new UnauthorizedException();
    request.user = { id: session.user.id, name: session.user.name, username: session.user.username, roles: session.user.roles };
    return true;
  }
}
