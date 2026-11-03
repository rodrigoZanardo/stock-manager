import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { AnalysisLocale, COVER_DAYS, InventoryAdvisor, InventoryRow, USAGE_WINDOW_DAYS } from '../application/inventory.use-case';
import { AppError } from '@stock/shared';

const LANGUAGE: Record<AnalysisLocale, string> = { en: 'English', pt: 'Brazilian Portuguese' };

const SYSTEM = `You are an inventory analyst for a small business.
You receive a JSON inventory report. Every number in it is already computed; never invent or recompute figures.
Field meanings: avgDailyOut = units out per day over the last ${USAGE_WINDOW_DAYS} days; daysOfCover = days the current stock lasts (null = no consumption);
suggestedQuantity = stock to keep for ${COVER_DAYS} days of consumption within the product min and max; reorderQuantity = units to buy now; status is LOW, OK or OVER.
Write a short plain-text report, without Markdown tables or # headings:
1. One sentence with the overall picture.
2. "Buy now": products to reorder, most urgent first (lowest daysOfCover or LOW status), with the quantity.
3. "Too much stock": products with status OVER or no consumption, and what to do.
4. One practical tip.
Quote SKUs exactly. Keep it under 250 words.`;

/** Sends the inventory report to Claude: numbers plus product names and SKUs. Never emails, passwords or tokens. */
@Injectable()
export class ClaudeInventoryAdvisor extends InventoryAdvisor {
  private readonly logger = new Logger(ClaudeInventoryAdvisor.name);
  private readonly client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ timeout: 60_000 }) : null;
  readonly enabled = this.client !== null;

  async analyze(rows: InventoryRow[], locale: AnalysisLocale): Promise<string> {
    if (!this.client) throw new AppError('AI_NOT_CONFIGURED');
    try {
      const response = await this.client.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        output_config: { effort: 'low' },
        // a refusal is retried server-side on a suitable model instead of failing the request
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        messages: [{ role: 'user', content: `Answer in ${LANGUAGE[locale]}.\n\n${JSON.stringify(rows)}` }],
      });
      const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
      if (response.stop_reason === 'refusal' || !text) throw new Error(`no analysis (stop_reason=${response.stop_reason})`);
      return text;
    } catch (e) {
      if (e instanceof AppError) throw e;
      // log the real cause for the operator; the user gets a translated, generic message
      this.logger.error(e instanceof Error ? e.message : String(e));
      throw new AppError('AI_FAILED');
    }
  }
}
