import { ApiProperty } from '@nestjs/swagger';
import { ROLES, type Role } from '@stock/shared';
import { AUDIT_ACTIONS, type AuditAction } from '../application/auth.use-cases';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com' }) @IsEmail() @MaxLength(120) email!: string;
  @ApiProperty({ example: 'change-me-please' }) @IsString() @MaxLength(128) password!: string;
}

export class CreateUserDto {
  @ApiProperty({ example: 'operator@example.com' }) @IsEmail() @MaxLength(120) email!: string;
  @ApiProperty({ example: 'a-long-password' }) @IsString() @MinLength(8) @MaxLength(128) password!: string;
  @ApiProperty({ enum: ROLES }) @IsIn(ROLES) role!: Role;
}

export class LoginResponse {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ enum: ROLES }) role!: Role;
}

export class UserResponse {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ROLES }) role!: Role;
}

/** Same shape as the stock service's audit entries, so the web app can list both the same way. */
export class AuditEntryResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: AUDIT_ACTIONS }) action!: AuditAction;
  @ApiProperty({ type: String, nullable: true, description: 'Always null: auth entries are not about a product.' }) productId!: null;
  @ApiProperty({ type: Object, example: { email: 'operator@example.com', role: 'OPERATOR' } }) details!: object;
  @ApiProperty({ type: String, nullable: true, description: 'Null for the first admin seeded at startup.' }) actorEmail!: string | null;
  @ApiProperty() createdAt!: Date;
}
