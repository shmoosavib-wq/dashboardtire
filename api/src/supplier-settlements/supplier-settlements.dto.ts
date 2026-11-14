import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

export const SUPPLIER_STORE_NAMES = ['فروشگاه هایپر تایرایران', 'فروشگاه معدن تایر شرق'] as const;

export class CreateSupplierSettlementDto {
  @IsOptional() @IsString() @Length(1, 120) storeName?: string;
  @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/) settledAt!: string;
  @IsInt() @Min(1) @Max(1000000000000000) amount!: number;
  @IsInt() @Min(1) @Max(1000000000000000) payableTotal!: number;
}

export class UpdateSupplierDebtDto {
  @IsInt() @Min(1) @Max(1000000000000000) payableTotal!: number;
  @IsString() @Length(1, 120) storeName!: string;
}

export class AddPurchaseProductDto {
  @IsString() @Length(1, 160) title!: string;
  @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @IsInt() @Min(1) @Max(1000000000000000) saleUnitPrice!: number;
  @IsUUID() driverId!: string;
}

export class UpdatePurchaseProductDto {
  @IsString() @Length(1, 160) title!: string;
  @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @IsInt() @Min(1) @Max(1000000000000000) saleUnitPrice!: number;
}
