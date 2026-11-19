import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  async getHealth(): Promise<{ status: string; database: string }> {
    await this.appService.checkDatabase();
    return { status: 'ok', database: 'connected' };
  }
}
