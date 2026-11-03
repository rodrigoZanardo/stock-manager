import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Actor, ApiErrorResponse, AuditQuery, CurrentUser, Public, Roles } from '@stock/shared';
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
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiResponse({ status: 200, type: LoginResponse, description: 'Signed in. Send accessToken as a Bearer token.' })
  @ApiErrorResponse(400, 'Email or password missing or malformed')
  @ApiErrorResponse(401, 'Wrong email or password')
  @ApiErrorResponse(429, 'Too many failed sign-ins: the account is locked for 15 minutes')
  signIn(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.login.execute(dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('users')
  @ApiOperation({ summary: 'Create a user (admin only)' })
  @ApiResponse({ status: 201, type: UserResponse, description: 'User created' })
  @ApiErrorResponse(400, 'Invalid email or password, or the email is already used')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is not an admin')
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: Actor): Promise<UserResponse> {
    const u = await this.createUser.execute(dto, actor);
    return { id: u.id, email: u.email, role: u.role };
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('users')
  @ApiOperation({ summary: 'List the team, by email (admin only)' })
  @ApiResponse({ status: 200, type: [UserResponse], description: 'Every user, without password data' })
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is not an admin')
  list(): Promise<UserResponse[]> {
    return this.users.execute();
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('audit/auth')
  @ApiOperation({ summary: 'Sign-ins and user creation, newest first (admin only)' })
  @ApiResponse({ status: 200, type: [AuditEntryResponse], description: 'Audit entries, newest first' })
  @ApiErrorResponse(400, 'The limit is not a whole number from 1 to 200')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is not an admin')
  async listAudit(@Query() query: AuditQuery): Promise<AuditEntryResponse[]> {
    const entries = await this.audit.execute(query.limit);
    return entries.map(({ id, action, details, actorEmail, createdAt }) => ({ id, action, productId: null, details, actorEmail, createdAt }));
  }
}
