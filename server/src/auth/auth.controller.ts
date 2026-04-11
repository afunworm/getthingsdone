import { Controller, Get, Res, HttpCode, Req, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('login')
  async login(@Res() res: Response) {
    const { url } = await this.authService.getAuthorizationUrl();
    res.redirect(url);
  }

  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    const redirectUri = this.config.getOrThrow('POCKETID_REDIRECT_URI');
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    const fullUrl = `${redirectUri}${qs}`;
    const { accessToken } = await this.authService.handleCallback(fullUrl);
    const frontendUrl = this.config.getOrThrow('FRONTEND_URL');
    res.redirect(`${frontendUrl}/auth/callback?token=${accessToken}`);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  me(@CurrentUser() user: any) {
    return user;
  }
}
