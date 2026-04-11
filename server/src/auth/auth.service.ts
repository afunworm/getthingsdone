import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as oidc from 'openid-client';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';

interface PendingAuth {
  codeVerifier: string;
  expires: number;
}

@Injectable()
export class AuthService {
  private oidcConfig: oidc.Configuration | null = null;
  // Server-side state store — avoids session/cookie fragility for OIDC handshake
  private readonly pending = new Map<string, PendingAuth>();

  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private async getOidcConfig(): Promise<oidc.Configuration> {
    if (this.oidcConfig) return this.oidcConfig;
    const issuerUrl = new URL(this.config.getOrThrow('POCKETID_ISSUER_URL'));
    this.oidcConfig = await oidc.discovery(
      issuerUrl,
      this.config.getOrThrow('POCKETID_CLIENT_ID'),
      this.config.getOrThrow('POCKETID_CLIENT_SECRET'),
    );
    return this.oidcConfig;
  }

  async getAuthorizationUrl(): Promise<{ url: string; state: string }> {
    const config = await this.getOidcConfig();
    const redirectUri = this.config.getOrThrow('POCKETID_REDIRECT_URI');

    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const state = oidc.randomState();

    // Store codeVerifier keyed by state — 10-minute TTL
    this.prunePending();
    this.pending.set(state, { codeVerifier, expires: Date.now() + 10 * 60 * 1000 });

    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    return { url: url.href, state };
  }

  async handleCallback(callbackUrl: string): Promise<{ accessToken: string; user: any }> {
    const config = await this.getOidcConfig();

    // Read state from the callback URL to look up our stored codeVerifier
    const params = new URL(callbackUrl).searchParams;
    const state = params.get('state') ?? '';

    const pending = this.pending.get(state);
    if (!pending || pending.expires < Date.now()) {
      throw new UnauthorizedException('Invalid or expired auth state');
    }
    this.pending.delete(state);

    const tokens = await oidc.authorizationCodeGrant(config, new URL(callbackUrl), {
      pkceCodeVerifier: pending.codeVerifier,
      expectedState: state,
    });

    const claims = tokens.claims();
    const sub = claims!.sub;
    const email = (claims!.email ?? '') as string;
    const name = ((claims!.name ?? claims!.preferred_username ?? email) as string);

    let user = this.db.prepare('SELECT * FROM users WHERE pocketid_sub = ?').get(sub) as any;

    if (!user) {
      const isFirst = !(this.db.prepare('SELECT 1 FROM users LIMIT 1').get());
      const id = uuidv4();
      const defaultTz = (this.db.prepare(
        "SELECT value FROM app_settings WHERE key = 'default_timezone'",
      ).get() as any)?.value ?? 'UTC';
      this.db.prepare(
        'INSERT INTO users (id, pocketid_sub, email, name, role, timezone) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, sub, email, name, isFirst ? 'admin' : 'user', defaultTz);
      user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    } else {
      this.db.prepare(
        'UPDATE users SET email = ?, name = ?, updated_at = unixepoch() WHERE id = ?',
      ).run(email, name, user.id);
      user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }

    const accessToken = this.jwt.sign({ sub: user.id, role: user.role });
    return { accessToken, user };
  }

  async validateUser(userId: string): Promise<any> {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private prunePending(): void {
    const now = Date.now();
    for (const [key, val] of this.pending) {
      if (val.expires < now) this.pending.delete(key);
    }
  }
}
