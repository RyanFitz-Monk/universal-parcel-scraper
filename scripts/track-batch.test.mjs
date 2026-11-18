import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readShipments } from './track-batch.mjs';

describe('readShipments', () => {
  it('reads quoted Excel CSV columns and optional carrier hints', () => {
    assert.deepEqual(readShipments('Recipient,Company,Tracking #,Carrier\r\n"Ada, A.",Example,123456789012,ups'), [{
        row: 2,
        number: '123456789012',
        recipient: 'Ada, A.',
        company: 'Example',
        campaign: '',
        carrier: 'ups',
      }]);
  });

  it('reads tab-separated workbook text and ignores rows without tracking numbers', () => {
    assert.deepEqual(readShipments('Recipient\tCompany\tCampaign\tTracking #\nAda\tExample\tLaunch\t123456789012\nBob\tCo\tLaunch\t'), [{
        row: 2,
        number: '123456789012',
        recipient: 'Ada',
        company: 'Example',
        campaign: 'Launch',
        carrier: undefined,
      }]);
  });

  it('rejects files without a tracking-number column', () => {
    assert.throws(() => readShipments('Recipient,Company\nAda,Example'), /No tracking-number column was found/);
  });
});
