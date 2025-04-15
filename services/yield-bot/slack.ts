export interface SlackMessage {
  messages: string[];
  mint: 'M' | 'wM';
  service: 'yield-bot' | 'index-bot';
  level: string;
}

export async function sendSlackMessage(message: SlackMessage) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('SLACK_WEBHOOK_URL is not set');
    return;
  }

  const { mint, messages, level, service } = message;

  const body = {
    mint,
    service,
    level,
    message: messages.join('\n'),
    link: grafanaLinkBuilder(process.env.GRAFANA_URL ?? '', message.service, message.mint, ''),
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.warn(`Failed to send Slack message (${response.status}): ${response.statusText}`);
    return;
  }
}

function grafanaLinkBuilder(baseURL: string, service: 'yield-bot' | 'index-bot', mint: 'M' | 'wM', query?: string) {
  const q = query ? encodeURIComponent(query) : '';
  return `${baseURL}/d/feizlsuzk2dc0e/search-logs?orgId=1&from=now-6h&to=now&timezone=browser&var-query0=&var-service=${service}&var-query0-2=&var-mint=${mint}&var-query0-3=&var-query=${q}`;
}
