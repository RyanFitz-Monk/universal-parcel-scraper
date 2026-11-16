import { describe, expect, it } from 'vitest';
import { amazonShareToken } from '../../core/catalog/urls.js';
import { parseTrackingInput } from '../../core/detection/index.js';
import { createTracker } from '../../facade/index.js';

describe('Amazon order live tracking links', () => {
  it.skipIf(!process.env.AMAZON_ORDER_TRACKING_URL)('reads the status of the supplied Share tracking link', async () => {
    const link = process.env.AMAZON_ORDER_TRACKING_URL!;
    const parsed = parseTrackingInput(link);
    expect(parsed.carrier).toBe('amazon-order');
    const answer = await createTracker({ providers: [] }).track({ carrier: 'amazon-order', number: parsed.trackingNumber, trackingUrl: link });
    expect(answer).toMatchObject({ carrier: 'amazon-order', source: 'amazon-order', result: { summary_only: true } });
    expect(answer.result.current_stage).toBeDefined();
    expect(JSON.stringify(answer)).not.toContain(amazonShareToken(parsed.trackingNumber)!);
  });
});
