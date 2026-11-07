import { Controller, Get, Param, Query } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('hello/:name')
  getHelloName(
    @Param('name') name: string,
    @Query('loud') loud?: string,
  ) {
    let greeting = `Hello, ${name}`;
    if (loud === 'true') {
      greeting = greeting.toUpperCase();
    }
    return { greeting };
  }
  }