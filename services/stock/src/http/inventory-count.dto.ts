import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { COUNT_STATUSES, type CountStatus } from '../domain/inventory-count';

export class CountedItemDto {
  @ApiProperty() @IsUUID() productId!: string;
  @ApiProperty({ example: 12, description: 'Units found on the shelf' }) @IsInt() @Min(0) counted!: number;
}

export class CountedItemsDto {
  @ApiProperty({ type: [CountedItemDto], description: 'Some or all products of the count; the others keep what they had' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => CountedItemDto) items!: CountedItemDto[];
}

export class CountItemResponse {
  @ApiProperty() productId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) location!: string | null;
  @ApiProperty({ description: 'Quantity when the count started' }) expected!: number;
  @ApiProperty({ type: Number, nullable: true, description: 'null until entered' }) counted!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'counted - expected; null until counted' }) difference!: number | null;
}

export class InventoryCountResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Sequential, from 1' }) number!: number;
  @ApiProperty({ enum: COUNT_STATUSES }) status!: CountStatus;
  @ApiProperty({ type: [CountItemResponse] }) items!: CountItemResponse[];
  @ApiProperty() createdAt!: Date;
}
