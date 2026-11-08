import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { DocumentCategory, WorkflowStage } from '@prisma/client';

export class CreateDriverDto {
  @IsString() @Length(2, 120) fullName!: string;
  @IsString() @Matches(/^09\d{9}$/) mobile!: string;
  @IsOptional() @IsString() @Matches(/^\d{10}$/) nationalId?: string;
  @IsOptional() @IsString() @Length(1, 160) productHint?: string;
  @IsOptional() @IsString() @Length(0, 1500) intentNote?: string;
}

export class SaveDraftDto {
  @IsEnum(WorkflowStage) stage!: WorkflowStage;
  @IsObject() payload!: Record<string, unknown>;
}

export class WorkflowActionDto {
  @IsString() @Length(3, 60) action!: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsString() @Length(0, 1500) note?: string;
}

export class ArchiveDriverDto {
  @IsOptional() @IsString() @Length(0, 500) reason?: string;
}

export class StoreSettlementDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) settledAt!: string;
  @IsInt() @Min(1) @Max(1000000000000000) amount!: number;
}

export class UploadDocumentDto {
  @IsEnum(DocumentCategory) category!: DocumentCategory;
  @IsOptional() @IsString() @Length(1, 120) customTitle?: string;
  @IsOptional() @IsEnum(WorkflowStage) stage?: WorkflowStage;
}
