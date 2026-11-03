import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** What an audit entry's `details` column holds: plain JSON, so it maps straight to a Prisma Json field. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

/** Shallow check for rows read back from a Json column; anything else means corrupted data. */
export const isJsonObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `?limit=N` for the audit endpoints of every service. */
export class AuditQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 100 })
  // query values arrive as strings
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(200) limit: number = 100;
}
