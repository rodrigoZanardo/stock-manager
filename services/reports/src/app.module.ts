import { Module } from '@nestjs/common';
import { CoreModule } from '@stock/shared';
import { GetDashboardUseCase } from './application/dashboard.use-case';
import { AnalyzeInventoryUseCase, GetInventoryUseCase, InventoryAdvisor } from './application/inventory.use-case';
import { StockReader } from './application/stock-reader';
import { DashboardController } from './http/dashboard.controller';
import { InventoryController } from './http/inventory.controller';
import { ClaudeInventoryAdvisor } from './infra/claude-inventory.advisor';
import { HttpStockReader } from './infra/http-stock-reader';

/** No database: every number comes from the stock service, so there is one source of truth. */
@Module({
  imports: [CoreModule],
  controllers: [DashboardController, InventoryController],
  providers: [
    { provide: StockReader, useClass: HttpStockReader },
    { provide: InventoryAdvisor, useClass: ClaudeInventoryAdvisor },
    GetDashboardUseCase,
    GetInventoryUseCase,
    AnalyzeInventoryUseCase,
  ],
})
export class AppModule {}
