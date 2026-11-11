import 'dotenv/config';
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { ValidationError } from 'class-validator';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { resolve } from 'node:path';
import helmet from 'helmet';
import { AppModule } from './app.module';

const validationFieldLabels: Record<string, string> = {
  fullName: '\u0646\u0627\u0645 \u0648 \u0646\u0627\u0645 \u062e\u0627\u0646\u0648\u0627\u062f\u06af\u06cc',
  mobile: '\u0634\u0645\u0627\u0631\u0647\u0654 \u0645\u0648\u0628\u0627\u06cc\u0644',
  nationalId: '\u06a9\u062f \u0645\u0644\u06cc',
};

function validationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => {
    const label = validationFieldLabels[error.property] || error.property;
    const rules = Object.keys(error.constraints || {});
    const messages = rules.map((rule) => {
      if (error.property === 'nationalId' && rule === 'matches') return '\u06a9\u062f \u0645\u0644\u06cc \u0628\u0627\u06cc\u062f \u062f\u0642\u06cc\u0642\u0627\u064b ۱۰ \u0631\u0642\u0645 \u0628\u0627\u0634\u062f.';
      if (error.property === 'mobile' && rule === 'matches') return '\u0634\u0645\u0627\u0631\u0647\u0654 \u0645\u0648\u0628\u0627\u06cc\u0644 \u0628\u0627\u06cc\u062f \u0628\u0627 ۰۹ \u0634\u0631\u0648\u0639 \u0634\u0648\u062f \u0648 ۱۱ \u0631\u0642\u0645 \u0628\u0627\u0634\u062f.';
      if (rule === 'matches') return `${label}: \u0642\u0627\u0644\u0628 \u0648\u0627\u0631\u062f\u0634\u062f\u0647 \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a.`;
      if (rule === 'isString') return `${label}: \u0645\u0642\u062f\u0627\u0631 \u0648\u0627\u0631\u062f\u0634\u062f\u0647 \u0628\u0627\u06cc\u062f \u0645\u062a\u0646 \u0628\u0627\u0634\u062f.`;
      if (rule === 'isInt' || rule === 'isNumber') return `${label}: \u0644\u0637\u0641\u0627\u064b \u06cc\u06a9 \u0639\u062f\u062f \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f.`;
      if (rule === 'min' || rule === 'minLength') return `${label}: \u0645\u0642\u062f\u0627\u0631 \u0648\u0627\u0631\u062f\u0634\u062f\u0647 \u06a9\u0645\u062a\u0631 \u0627\u0632 \u062d\u062f \u0645\u062c\u0627\u0632 \u0627\u0633\u062a.`;
      if (rule === 'max' || rule === 'maxLength') return `${label}: \u0645\u0642\u062f\u0627\u0631 \u0648\u0627\u0631\u062f\u0634\u062f\u0647 \u0628\u06cc\u0634\u062a\u0631 \u0627\u0632 \u062d\u062f \u0645\u062c\u0627\u0632 \u0627\u0633\u062a.`;
      if (rule === 'isDateString') return `${label}: \u062a\u0627\u0631\u06cc\u062e \u0648\u0627\u0631\u062f\u0634\u062f\u0647 \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a.`;
      if (rule === 'isBoolean') return `${label}: \u0645\u0642\u062f\u0627\u0631 \u0628\u0627\u06cc\u062f \u0628\u0644\u0647 \u06cc\u0627 \u062e\u06cc\u0631 \u0628\u0627\u0634\u062f.`;
      if (rule === 'isEnum') return `${label}: \u06af\u0632\u06cc\u0646\u0647\u0654 \u0627\u0646\u062a\u062e\u0627\u0628\u200c\u0634\u062f\u0647 \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a.`;
      if (rule === 'whitelistValidation') return '\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062d\u0627\u0648\u06cc \u0641\u06cc\u0644\u062f \u0646\u0627\u0634\u0646\u0627\u062e\u062a\u0647 \u0627\u0633\u062a.';
      return `${label}: \u0645\u0642\u062f\u0627\u0631 \u0648\u0627\u0631\u062f\u0634\u062f\u0647 \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a.`;
    });
    return [...messages, ...validationMessages(error.children || [])];
  });
}

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
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new BadRequestException(validationMessages(errors)),
  }));
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
