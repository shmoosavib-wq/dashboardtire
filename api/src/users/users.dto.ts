import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsString() @Length(2, 100) name!: string;
  @IsString() @Matches(/^[a-zA-Z0-9._-]{3,40}$/) username!: string;
  @IsString() @MinLength(12) @Length(12, 128) password!: string;
  @IsArray() @ArrayMinSize(1) @IsEnum(UserRole, { each: true }) roles!: UserRole[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() @Length(2, 100) name?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsEnum(UserRole, { each: true }) roles?: UserRole[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ResetPasswordDto {
  @IsString() @MinLength(12) @Length(12, 128) password!: string;
}
