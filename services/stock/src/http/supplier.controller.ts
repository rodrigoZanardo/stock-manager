import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Actor, ApiErrorResponse, AppError, CurrentUser, Roles } from '@stock/shared';
import { CreateSupplierUseCase, DeleteSupplierUseCase, ListSuppliersUseCase, UpdateSupplierUseCase } from '../application/purchasing.use-cases';
import { Supplier } from '../domain/supplier';
import { SupplierDto, SupplierResponse } from './purchasing.dto';

const supplierId = new ParseUUIDPipe({ exceptionFactory: () => new AppError('SUPPLIER_NOT_FOUND') });
const toResponse = (s: Supplier): SupplierResponse => ({ id: s.id, name: s.name, document: s.document, email: s.email, phone: s.phone });

@ApiTags('suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SupplierController {
  constructor(
    private readonly createSupplier: CreateSupplierUseCase,
    private readonly listSuppliers: ListSuppliersUseCase,
    private readonly updateSupplier: UpdateSupplierUseCase,
    private readonly deleteSupplier: DeleteSupplierUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List suppliers by name' })
  @ApiResponse({ status: 200, type: [SupplierResponse] })
  @ApiErrorResponse(401, 'Missing or expired token')
  async list(): Promise<SupplierResponse[]> {
    return (await this.listSuppliers.execute()).map(toResponse);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Post()
  @ApiOperation({ summary: 'Create a supplier (admin or operator)' })
  @ApiResponse({ status: 201, type: SupplierResponse })
  @ApiErrorResponse(400, 'Invalid input, invalid CNPJ or email, or the name is already used')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is a viewer')
  async create(@Body() dto: SupplierDto, @CurrentUser() actor: Actor): Promise<SupplierResponse> {
    return toResponse(await this.createSupplier.execute(dto, actor));
  }

  @Roles('ADMIN', 'OPERATOR')
  @Put(':id')
  @ApiOperation({ summary: 'Replace a supplier; optional fields left out are cleared (admin or operator)' })
  @ApiResponse({ status: 200, type: SupplierResponse })
  @ApiErrorResponse(400, 'Invalid input, invalid CNPJ or email, or the name is already used')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is a viewer')
  @ApiErrorResponse(404, 'Supplier not found')
  async update(@Param('id', supplierId) id: string, @Body() dto: SupplierDto, @CurrentUser() actor: Actor): Promise<SupplierResponse> {
    return toResponse(await this.updateSupplier.execute({ id, ...dto }, actor));
  }

  @Roles('ADMIN', 'OPERATOR')
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a supplier with no purchase orders (admin or operator)' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiErrorResponse(400, 'The supplier has purchase orders')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is a viewer')
  @ApiErrorResponse(404, 'Supplier not found')
  remove(@Param('id', supplierId) id: string, @CurrentUser() actor: Actor): Promise<void> {
    return this.deleteSupplier.execute(id, actor);
  }
}
