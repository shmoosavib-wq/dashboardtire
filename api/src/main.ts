import 'dotenv/config';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { resolve } from 'node:path';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });
  app.use(helmet());
  app.setGlobalPrefix('api');
  const appOrigin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173';
  app.enableCors({
    origin: appOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  if (process.env.NODE_ENV === 'production') {
    const webRoot = resolve(__dirname, '../../web/dist');
    app.useStaticAssets(webRoot, { index: false, fallthrough: true });
    app.use((request: Request, response: Response, next: NextFunction) => {
      if (request.method !== 'GET' || request.path === '/api' || request.path.startsWith('/api/')) return next();
      response.sendFile(resolve(webRoot, 'index.html'));
    });
  }
  const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  await app.listen(Number(process.env.PORT || 3001), host);
}

void bootstrap();
