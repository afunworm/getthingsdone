import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly db: DatabaseService) {}

  private getConfig() {
    return this.db.prepare('SELECT * FROM smtp_config WHERE id = 1').get() as any;
  }

  private createTransport(config: any) {
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: !!config.secure,
      auth: config.username ? { user: config.username, pass: config.password } : undefined,
    });
  }

  async send(to: string, subject: string, html: string): Promise<boolean> {
    const config = this.getConfig();
    if (!config?.host) {
      this.logger.warn(`Mail not configured — skipping email to ${to}: ${subject}`);
      return false;
    }

    try {
      const transport = this.createTransport(config);
      await transport.sendMail({
        from: `"${config.from_name}" <${config.from_address}>`,
        to,
        subject,
        html,
      });
      return true;
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
      return false;
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const config = this.getConfig();
    if (!config?.host) return { ok: false, error: 'SMTP not configured' };
    try {
      const transport = this.createTransport(config);
      await transport.verify();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}
