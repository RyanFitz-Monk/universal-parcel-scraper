import { describe, expect, it } from 'vitest';
import { isOnlogExpressReference } from '../../core/detection/onlogExpress.js';
import { normalizeCarrierResult } from '../../core/result/index.js';
import { normalizeOnlogExpressNumber, ONLOG_EXPRESS_MAX_BYTES, parseOnlogExpress } from './parser.js';
import { onlogExpressMappedStage, onlogExpressStage, statusMap } from './status.js';
import statuses from './statuses.json' with { type: 'json' };

const NUMBER = 'AA6748923051';
const OTHER = 'AA9357026841';
const NOT_FOUND = 'Nenhum objeto encontrado na base de dados.';
interface Scan { wording: string; clock: string; place?: string }
const SCANS: Scan[] = [
  { wording: 'OBJETO CRIADO', clock: '01/04/2026 03:27' },
  { wording: 'ETIQUETA EMITIDA', clock: '01/04/2026 03:27' },
  { wording: 'OBJETO POSTADO', clock: '02/04/2026 13:15' },
  { wording: 'OBJETO EM TRANSFERÊNCIA', clock: '02/04/2026 14:27', place: 'CIDADE EXEMPLO - SP' },
  { wording: 'OBJETO EM TRANSFERÊNCIA', clock: '03/04/2026 05:00', place: 'OUTRA CIDADE - SP' },
  { wording: 'OBJETO SAIU PARA ENTREGA AO DESTINATÁRIO', clock: '03/04/2026 10:22' },
  { wording: 'OBJETO ENTREGUE AO DESTINATÁRIO', clock: '03/04/2026 14:13' },
];

/** Synthetic guest HTML: identities, aliases, clocks and places are invented. */
const html = (scans: readonly Scan[] = SCANS, identity = NUMBER): string => `<div class="shipment">
  <div class="text-sm">OBJETO SYNTHETIC-ALIAS</div><h3 class="mb-2">${identity}</h3>
  <div class="provider">FASTPACK</div>
  <div class="rastreio-wrapper">${scans.map(scan => `<div class="rastreio-item">
    <div class="timeline"><i class="fas fa-square"></i></div>
    <div class="texto-rastreio"><span class="position-relative">${scan.wording}</span><span class="text-sm">${scan.place ?? ''}</span>${scan.clock}</div>
  </div>`).join('')}</div></div>`;
const payload = (scans: readonly Scan[] = SCANS) => ({ sucesso: true, html: html(scans) });
const fail = (value: unknown, kind: string) => expect(() => parseOnlogExpress(value, NUMBER)).toThrow(expect.objectContaining({ kind }));

describe('Onlog Express guest response parser', () => {
  it('reads every native milestone newest first and preserves the unoffset minute clocks', () => {
    const result = parseOnlogExpress(payload(), NUMBER);
    expect(result).toMatchObject({ status: 'delivered', current_stage: 'delivered', current_stage_source: 'carrier_map',
      last_status_text: 'OBJETO ENTREGUE AO DESTINATÁRIO', last_update: null, last_update_local: '2026-04-03T14:13' });
    expect(result.events!.map(event => [event.local_time, event.stage])).toEqual([
      ['2026-04-03T14:13', 'delivered'],
      ['2026-04-03T10:22', 'out_for_delivery'],
      ['2026-04-03T05:00', 'in_transit'],
      ['2026-04-02T14:27', 'in_transit'],
      ['2026-04-02T13:15', 'accepted'],
      ['2026-04-01T03:27', 'registered'],
      ['2026-04-01T03:27', 'registered'],
    ]);
    expect(result.events![2]).toMatchObject({ location: 'OUTRA CIDADE - SP' });
    expect(result.events!.every(event => event.stage_source === 'carrier_map' && !event.time && !event.time_zone && !event.provider_code)).toBe(true);
    expect(result.timezone).toBeUndefined();
  });

  it('keeps the created and label rows at the same minute in their native order', () => {
    const result = normalizeCarrierResult(parseOnlogExpress(payload(), NUMBER));
    expect(result.events!.slice(-2).map(event => [event.description, event.tie_order])).toEqual([
      ['ETIQUETA EMITIDA', 1], ['OBJETO CRIADO', 0],
    ]);
  });

  it('projects only native scan wording, place and clock without assigning portal-brand ownership', () => {
    const value = payload();
    value.html += '<div class="recipient">SYNTHETIC RECIPIENT</div><div class="staff">SYNTHETIC STAFF</div><div class="cpf">SYNTHETIC CPF</div><a href="/synthetic-pod">SYNTHETIC POD</a>';
    const result = parseOnlogExpress(value, NUMBER);
    const output = JSON.stringify(result);
    for (const text of [NUMBER, 'SYNTHETIC', 'FASTPACK', 'OBJETO SYNTHETIC-ALIAS']) expect(output).not.toContain(text);
    for (const field of ['receiver_name', 'receiver_address', 'signed_by', 'delivery_carrier', 'delivery_tracking_number', 'canonical_tracking_number', 'provider_code']) {
      expect(result[field], field).toBeUndefined();
    }
  });

  it('shares the bounded whole AA reference validation with detection', () => {
    expect(isOnlogExpressReference(NUMBER)).toBe(true);
    expect(normalizeOnlogExpressNumber('aa 67489-23051')).toBe(NUMBER);
    for (const value of ['AB6748923051', '6748923051', 'AA674892305', `${NUMBER}7`, `${NUMBER}BR`, `${NUMBER} ${OTHER}`, `AA${' '.repeat(70)}6748923051`]) {
      expect(isOnlogExpressReference(value), value).toBe(false);
      expect(() => normalizeOnlogExpressNumber(value)).toThrow(expect.objectContaining({ kind: 'invalid_input' }));
    }
    expect(isOnlogExpressReference(null as unknown as string)).toBe(false);
  });

  it.each([OTHER, `${NUMBER}7`, `${NUMBER} ${OTHER}`, `${NUMBER}${' '.repeat(300)}${OTHER}`])('rejects a different whole heading identity', identity => {
    fail({ sucesso: true, html: html(SCANS, identity) }, 'indeterminate');
  });

  it('refuses multiple shipment cards, even when one matches or repeats the requested number', () => {
    fail({ sucesso: true, html: html() + html(SCANS, OTHER) }, 'indeterminate');
    fail({ sucesso: true, html: html() + html() }, 'indeterminate');
    fail({ sucesso: true, html: html().replace('</h3>', `</h3><h3>${NUMBER}</h3>`) }, 'indeterminate');
  });

  it('requires the observed false envelope and exact negative message for not found', () => {
    fail({ sucesso: false, mensagem: NOT_FOUND }, 'not_found');
    fail({ sucesso: true, mensagem: NOT_FOUND }, 'schema');
    fail({ mensagem: NOT_FOUND }, 'schema');
    fail({ sucesso: false, mensagem: NOT_FOUND, html: html() }, 'indeterminate');
    fail({ sucesso: false, mensagem: NOT_FOUND.toLowerCase() }, 'indeterminate');
  });

  it.each([{ sucesso: false }, { sucesso: false, mensagem: 'Falha no serviço.' }, { sucesso: false, mensagem: '' }])('does not turn generic failures into parcel absence', value => {
    fail(value, 'indeterminate');
  });

  it.each([
    { sucesso: false, mensagem: 'Falha ao validar o CAPTCHA.' },
    { sucesso: false, mensagem: 'Turnstile token inválido.' },
    { sucesso: true, html: '<div class="cf-turnstile"></div>' },
    '<html><title>Just a moment...</title><script>window._cf_chl_opt = {};</script></html>',
  ])('keeps verification refusals and block pages as challenges', value => fail(value, 'challenge'));

  it.each([undefined, null, ''])('rejects missing envelopes', value => fail(value, 'schema'));
  it.each([{ sucesso: true, html: '' }, { sucesso: true, html: '   ' }])('keeps empty successful replies inconclusive', value => fail(value, 'indeterminate'));

  it('keeps an identity-bound empty history as listed without declaring absence', () => {
    expect(() => parseOnlogExpress(payload([]), NUMBER)).toThrow(expect.objectContaining({ kind: 'indeterminate', reason: 'listed' }));
  });

  it.each([{}, [], 'not JSON', { sucesso: 'true', html: html() }, { sucesso: true }, { sucesso: true, html: {} },
    { sucesso: true, html: '<div class="rastreio-wrapper"></div>' }, { sucesso: true, html: `<h3>${NUMBER}</h3>` },
  ])('rejects malformed envelopes and changed HTML structure', value => fail(value, 'schema'));

  it.each(['30/02/2026 10:00', '01/04/2026 24:00', '01/04/2026 10:60', '01/13/2026 10:00',
    '2026-04-01 10:00', '01/04/2026 10:00:01', '01/04/2026', '',
  ])('rejects an invalid or unobserved scan clock', clock => fail(payload([{ wording: 'OBJETO POSTADO', clock }]), 'schema'));

  it('reads unpadded day, month and hour without adding seconds or an offset', () => {
    const result = parseOnlogExpress(payload([{ wording: 'OBJETO POSTADO', clock: '1/4/2026 3:27' }]), NUMBER);
    expect(result.events![0]).toMatchObject({ local_time: '2026-04-01T03:27', stage: 'accepted' });
    expect(result.events![0]!.time).toBeUndefined();
  });

  it('retains unknown native wording without a guessed stage', () => {
    const result = parseOnlogExpress(payload([{ wording: 'OBJETO COM NOVA FORMULAÇÃO', clock: '01/04/2026 10:00' }]), NUMBER);
    expect(result).toMatchObject({ status: 'unknown', last_status_text: 'OBJETO COM NOVA FORMULAÇÃO' });
    expect(result.current_stage).toBeUndefined();
    expect(result.events![0]!.stage).toBeUndefined();
    expect(result.events![0]!.stage_source).toBeUndefined();
  });

  it('does not preserve delivered status under a newer unmapped native scan', () => {
    const result = parseOnlogExpress(payload([...SCANS, { wording: 'OBJETO COM NOVA FORMULAÇÃO', clock: '04/04/2026 10:00' }]), NUMBER);
    expect(result.status).toBe('unknown');
    expect(result.current_stage).toBeUndefined();
    expect(result.events![0]!.stage).toBeUndefined();
  });

  it('rejects malformed scan text, duplicate containers and histories beyond the bounds', () => {
    fail(payload([{ wording: '', clock: '01/04/2026 10:00' }]), 'schema');
    fail(payload([{ wording: 'x'.repeat(501), clock: '01/04/2026 10:00' }]), 'schema');
    fail({ sucesso: true, html: html().replace('class="texto-rastreio"', 'class="unexpected"') }, 'schema');
    fail({ sucesso: true, html: html().replace('</h3>', '</h3><div class="rastreio-wrapper"></div>') }, 'schema');
    fail(payload(Array<Scan>(501).fill(SCANS[0]!)), 'schema');
    fail({ sucesso: true, html: ' '.repeat(ONLOG_EXPRESS_MAX_BYTES + 1) }, 'schema');
  });

  it.each(statuses.entries)('maps only the recorded wording: $wording', entry => {
    expect(onlogExpressMappedStage(entry.wording)).toBe(entry.stage);
    expect(statusMap.stage(null, entry.wording.toLowerCase())).toBe(entry.stage);
    expect(statusMap.stage('synthetic-code', entry.wording)).toBeUndefined();
  });

  it('leaves other native wording open for review', () => {
    expect(onlogExpressStage('OBJETO COM NOVA FORMULAÇÃO')).toBeNull();
    expect(statusMap.gaps).toEqual([]);
  });
});
