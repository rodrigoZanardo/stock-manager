import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { MAX_CENTS } from '../domain/product';
import { PURCHASE_STATUSES, type PurchaseStatus } from '../domain/purchase-order';

export class SupplierDto {
  @ApiProperty({ example: 'Distribuidora Auto Sul' }) @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @ApiPropertyOptional({ example: '11.222.333/0001-81', nullable: true, type: String, description: 'CNPJ, with or without punctuation. Empty or null: none.' })
  @IsOptional() @IsString() @MaxLength(18) document?: string | null;
  @ApiPropertyOptional({ example: 'vendas@autosul.com.br', nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(120) email?: string | null;
  @ApiPropertyOptional({ example: '(51) 3333-4444', nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
}

export class SupplierResponse {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true, description: '14 digits' }) document!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
}

export class PurchaseItemDto {
  @ApiProperty() @IsUUID() productId!: string;
  @ApiProperty({ example: 10 }) @IsInt() @Min(1) quantity!: number;
  @ApiProperty({ example: 3200, description: 'Cents' }) @IsInt() @Min(0) @Max(MAX_CENTS) unitCost!: number;
}

export class PurchaseItemsDto {
  @ApiProperty({ type: [PurchaseItemDto] }) @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PurchaseItemDto) items!: PurchaseItemDto[];
}

export class CreatePurchaseOrderDto extends PurchaseItemsDto {
  @ApiProperty() @IsUUID() supplierId!: string;
}

export class SuggestPurchaseOrderDto {
  @ApiProperty() @IsUUID() supplierId!: string;
}

export class PurchaseItemResponse extends PurchaseItemDto {
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
}

export class PurchaseOrderResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Sequential, from 1' }) number!: number;
  @ApiProperty() supplierId!: string;
  @ApiProperty() supplierName!: string;
  @ApiProperty({ enum: PURCHASE_STATUSES }) status!: PurchaseStatus;
  @ApiProperty({ type: [PurchaseItemResponse] }) items!: PurchaseItemResponse[];
  @ApiProperty({ description: 'Sum of quantity x unitCost, in cents' }) total!: number;
  @ApiProperty() createdAt!: Date;
}
