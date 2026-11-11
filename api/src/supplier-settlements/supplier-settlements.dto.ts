import { IsDateString, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

export class CreateSupplierSettlementDto {
  @IsOptional() @IsString() @Length(1, 120) storeName?: string;
  @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/) settledAt!: string;
  @IsInt() @Min(1) @Max(1000000000000000) amount!: number;
  @IsInt() @Min(1) @Max(1000000000000000) payableTotal!: number;
}

export class UpdateSupplierDebtDto {
  @IsInt() @Min(1) @Max(1000000000000000) payableTotal!: number;
}
