import { IsString, Length, Matches, MinLength } from 'class-validator';

export class SetupSuperAdminDto {
  @IsString() @MinLength(32) @Length(32, 256) bootstrapToken!: string;
  @IsString() @Length(2, 100) name!: string;
  @IsString() @Matches(/^[a-zA-Z0-9._-]{3,40}$/) username!: string;
  @IsString() @MinLength(12) @Length(12, 128) password!: string;
}

export class LoginDto {
  @IsString() @Length(3, 40) username!: string;
  @IsString() @Length(1, 128) password!: string;
}
