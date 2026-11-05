import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MOVEMENT_TYPES, type MovementType, STOCK_STATUSES, type StockStatus } from '@stock/shared';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateProductDto {
  @ApiProperty({ example: 'Mechanical keyboard' }) @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @ApiProperty({ example: 5 }) @IsInt() @Min(0) minQuantity!: number;
  @ApiPropertyOptional({ example: 50, nullable: true, type: Number, description: 'Empty or null means no upper limit.' })
  @IsOptional() @IsInt() @Min(1) maxQuantity?: number | null;
  @ApiPropertyOptional({ example: 'R01-B03-A04-P060-N1', nullable: true, type: String, description: 'Bin location: Rua-Bloco-Andar-Posição-Nível. Empty or null clears it.' })
  @IsOptional() @IsString() @MaxLength(32) location?: string | null;
}

export class CreateProductDto extends UpdateProductDto {
  @ApiProperty({ example: 'KB-001' }) @IsString() @IsNotEmpty() @MaxLength(32) sku!: string;
}

export class MovementResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: MOVEMENT_TYPES }) type!: MovementType;
  @ApiProperty() quantity!: number;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Null for movements recorded before the audit trail.' }) actorEmail!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class MovementDto {
  @ApiProperty({ enum: MOVEMENT_TYPES }) @IsIn(MOVEMENT_TYPES) type!: MovementType;
  @ApiProperty({ example: 10 }) @IsInt() @Min(1) quantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class ProductResponse {
  @ApiProperty() id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Physical units on the shelf' }) quantity!: number;
  @ApiProperty({ description: 'Units held for open Live Orders orders' }) reserved!: number;
  @ApiProperty({ description: 'quantity - reserved (never below 0): what a stock OUT or a new order can take' }) available!: number;
  @ApiProperty() minQuantity!: number;
  @ApiProperty({ type: Number, nullable: true }) maxQuantity!: number | null;
  @ApiProperty({ type: String, nullable: true, example: 'R01-B03-A04-P060-N1' }) location!: string | null;
  @ApiProperty({ enum: STOCK_STATUSES }) status!: StockStatus;
}
