import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type Actor, AuditQuery, CurrentUser, Public, Roles } from '@stock/shared';
import { CreateUserUseCase, ListAuditUseCase, ListUsersUseCase, LoginUseCase } from '../application/auth.use-cases';
import { AuditEntryResponse, CreateUserDto, LoginDto, LoginResponse, UserResponse } from './auth.dto';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly createUser: CreateUserUseCase,
    private readonly audit: ListAuditUseCase,
    private readonly users: ListUsersUseCase,
  ) {}

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  signIn(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.login.execute(dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('users')
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: Actor): Promise<UserResponse> {
    const u = await this.createUser.execute(dto, actor);
    return { id: u.id, email: u.email, role: u.role };
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('users')
  list(): Promise<UserResponse[]> {
    return this.users.execute();
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('audit/auth')
  async listAudit(@Query() query: AuditQuery): Promise<AuditEntryResponse[]> {
    const entries = await this.audit.execute(query.limit);
    return entries.map(({ id, action, details, actorEmail, createdAt }) => ({ id, action, productId: null, details, actorEmail, createdAt }));
  }
}
