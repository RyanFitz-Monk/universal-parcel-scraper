import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';

const ID = 'AAACooperMasterPage_bodyContent_';

export function aaaCooperControlVisible($: CheerioAPI, element: Element): boolean {
  return !$(element).parents().addBack().toArray().some(node =>
    /display\s*:\s*none|visibility\s*:\s*hidden/i.test($(node).attr('style') ?? '') || $(node).is('[hidden]'));
}

/** Hidden validators are part of an ordinary negative page too. */
export function aaaCooperChallengeState($: CheerioAPI) {
  const rows = $(`#${ID}trTimedButton`), captcha = $(`#${ID}RadCaptcha1`);
  const rowVisible = rows.length === 1 && aaaCooperControlVisible($, rows[0]!);
  const rejected = captcha.length === 1 && captcha.hasClass('rcInvalid');
  const invalidVisible = $(`#${ID}ErrorPanel`).find('span,div,p').toArray().some(node =>
    !$(node).children().length && /The code you entered is not valid/i.test($(node).text()) && aaaCooperControlVisible($, node));
  return { rowVisible, rejected, invalidVisible,
    recoverable: rowVisible && $(`#${ID}ErrorPanel`).length === 1 && !$(`#${ID}ContentPanel`).length };
}
