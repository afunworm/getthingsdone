const ICON_MAP: Record<string, string> = {
  task_created:    '🟢',
  task_deleted:    '🗑️',
  task_updated:    '✏️',
  task_flow:       '🔄',
  task_assigned:   '👤',
  task_unassigned: '👤',
  task_comment:    '💬',
  task_upcoming:   '⏰',
  task_past_due:   '⚠️',
  task_reminder:   '🔔',
};

export function buildEmailHtml(opts: {
  title: string;
  body: string;
  type?: string;
  link?: string;
  items?: string[];
  /** Absolute base URL for the app, e.g. https://app.example.com — used to make link absolute */
  appUrl?: string;
}): string {
  const emoji = ICON_MAP[opts.type ?? ''] ?? '🔔';

  let href: string | undefined;
  if (opts.link) {
    const base = (opts.appUrl ?? '').replace(/\/$/, '');
    href = opts.link.startsWith('http') ? opts.link : `${base}${opts.link}`;
  }

  const buttonHtml = href
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px">
        <tr>
          <td style="border-radius:8px;background:#6366f1">
            <a href="${href}"
               style="display:inline-block;padding:11px 24px;font-size:14px;font-weight:600;
                      color:#ffffff;text-decoration:none;border-radius:8px;
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
              View task →
            </a>
          </td>
        </tr>
      </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#f4f4f5;padding:32px 0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="max-width:520px;margin:0 auto">

          <!-- Header -->
          <tr>
            <td style="padding:0 0 16px 0" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#6366f1;border-radius:10px;
                             width:36px;height:36px;text-align:center;
                             vertical-align:middle;font-size:18px;
                             font-weight:700;color:#fff;line-height:36px">
                    ✓
                  </td>
                  <td style="padding-left:10px;font-size:16px;font-weight:700;
                             color:#18181b;letter-spacing:-0.3px">
                    Get Things Done
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:12px;
                       border:1px solid #e4e4e7;padding:32px">

              <!-- Type badge -->
              <p style="margin:0 0 16px;font-size:22px;line-height:1">${emoji}</p>

              <!-- Title -->
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;
                         color:#18181b;line-height:1.3">
                ${opts.title}
              </h2>

              <!-- Body -->
              <p style="margin:0 0 ${opts.items?.length ? '16px' : '0'};font-size:15px;color:#52525b;line-height:1.6">
                ${opts.body}
              </p>

              ${opts.items?.length ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                     style="border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
                ${opts.items.map((item, i) => `
                <tr>
                  <td style="padding:10px 14px;font-size:14px;color:#18181b;
                             border-bottom:${i < opts.items!.length - 1 ? '1px solid #e4e4e7' : 'none'};
                             background:${i % 2 === 0 ? '#ffffff' : '#fafafa'}">
                    ⚠️ ${item}
                  </td>
                </tr>`).join('')}
              </table>` : ''}

              ${buttonHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 0 0;text-align:center">
              <p style="margin:0;font-size:12px;color:#a1a1aa">
                You received this because you have notifications enabled for this project.<br/>
                Manage your preferences in
                <a href="${(opts.appUrl ?? '').replace(/\/$/, '')}/settings"
                   style="color:#6366f1;text-decoration:none">notification settings</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
