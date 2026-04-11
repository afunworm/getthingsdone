import {
  Injectable, CanActivate, ExecutionContext, UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const auth: string = req.headers['authorization'] ?? '';

    if (!auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const raw = auth.slice(7).trim();
    if (!raw.startsWith('ft_')) {
      throw new UnauthorizedException('Invalid API token format');
    }

    const hash = createHash('sha256').update(raw).digest('hex');

    const token = this.db.prepare(`
      SELECT t.id, t.expires_at, u.id AS user_id, u.role AS user_role
      FROM api_tokens t
      JOIN users u ON u.id = t.created_by
      WHERE t.token_hash = ?
    `).get(hash) as any;

    if (!token) throw new UnauthorizedException('Invalid API token');

    if (token.expires_at && token.expires_at < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('API token has expired');
    }

    this.db.prepare('UPDATE api_tokens SET last_used_at = unixepoch() WHERE id = ?').run(token.id);

    req.user = { id: token.user_id, role: token.user_role };
    return true;
  }
}
