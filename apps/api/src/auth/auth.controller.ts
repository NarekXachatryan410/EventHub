import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token } = await this.authService.login(input);
    response.cookie('eventhub_auth', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api',
      maxAge: 8 * 60 * 60 * 1000,
    });
    return { user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('eventhub_auth', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api',
    });
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.authService.getCurrentUser(user.sub);
  }
}
