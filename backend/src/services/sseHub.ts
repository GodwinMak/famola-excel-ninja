import { Response } from 'express';

const clients = new Set<Response>();

export function addSseClient(res: Response) {
  clients.add(res);
}

export function removeSseClient(res: Response) {
  clients.delete(res);
}

export function broadcast(event: Record<string, unknown>) {
  const message = `data: ${JSON.stringify({ ...event, timestamp: Date.now() })}\n\n`;
  for (const client of clients) {
    try {
      client.write(message);
    } catch {
      clients.delete(client);
    }
  }
}
