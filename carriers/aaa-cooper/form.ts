import { load } from 'cheerio';
import type { Element } from 'domhandler';
import { ChallengeError, SchemaError } from '../../core/errors/index.js';
import { AAA_COOPER_MAX_BYTES, PROVIDER } from './parser.js';
import { aaaCooperChallengeState } from './challenge.js';

const ID = 'AAACooperMasterPage_bodyContent_', TSM = 'AAACooperMasterPage_ACTScriptManager_TSM';
const ANSWER = 'AAACooperMasterPage$bodyContent$RadCaptcha1$CaptchaTextBox';
const SUBMIT = 'AAACooperMasterPage$bodyContent$btnSubmit';
const ORIGIN = 'https://www.aaacooper.com', PATH = '/pwb/Transit/ProTrackResults.aspx';
const RESOURCE = '/pwb/Telerik.Web.UI.WebResource.axd';
type Diagnostics = Record<string, boolean | number>;

export interface AaaCooperForm {
  imageUrl: URL;
  puzzle: string;
  scriptUrl: URL | null;
  scriptState: string;
  hidden: [string, string][];
  controls: [string, string][];
  submitValue: string;
  diagnostics: Diagnostics;
}

function refused(diagnostics: Diagnostics): never {
  throw Object.assign(new ChallengeError(PROVIDER, 'AAA Cooper native CAPTCHA form is unavailable'), { diagnostics });
}

/** No hidden value, query, cookie or image token is included in diagnostics. */
export function aaaCooperForm(html: string, url: string): AaaCooperForm {
  const $ = load(html), form = $('form#aspnetForm'), field = form.find(`#${ID}RadCaptcha1_CaptchaTextBox`);
  const submit = form.find(`#${ID}btnSubmit`), image = form.find(`img#${ID}RadCaptcha1_CaptchaImageUP`);
  const enabled = (node: Element) => !$(node).is('[disabled]') && !$(node).parents('fieldset[disabled]').length;
  const hidden = form.find('input[type="hidden"][name]').toArray().filter(enabled);
  const names = hidden.map(node => $(node).attr('name')!);
  const values = (name: string) => hidden.filter(node => $(node).attr('name') === name).map(node => $(node).attr('value') ?? '');
  const countValues = values('__VIEWSTATEFIELDCOUNT');
  const count = !countValues.length ? 1 : countValues.length === 1 && /^\d{1,2}$/.test(countValues[0]!) ? Number(countValues[0]) : 0;
  const segments = count >= 1 && count <= 64 ? Array.from({ length: count }, (_, i) => i ? `__VIEWSTATE${i}` : '__VIEWSTATE') : [];
  let action: URL | undefined, imageUrl: URL | undefined;
  try { if (form.attr('action')) action = new URL(form.attr('action')!, url); } catch { /* Report the condition, not the URL. */ }
  try { if (image.attr('src')) imageUrl = new URL(image.attr('src')!, url); } catch { /* Same for per-session image tokens. */ }
  const expected = new URL(url), scriptValues = values(TSM);
  const sources = $('script[src]').toArray().map(node => $(node).attr('src')!).filter(src => src.includes('_TSM_CombinedScripts_'));
  let scriptUrl: URL | null = null;
  try { if (sources.length === 1) scriptUrl = new URL(sources[0]!, url); } catch { /* Validated below. */ }
  const filledScriptState = scriptValues.length === 1 && scriptValues[0]!.length > 0 && scriptValues[0]!.length <= 4096;
  const diagnostics: Diagnostics = {
    formCount: form.length, answerCount: field.length, submitCount: submit.length, imageCount: image.length,
    hiddenCount: hidden.length, viewstateSegmentCount: count, scriptResourceCount: sources.length,
    visibleNativeChallenge: aaaCooperChallengeState($).recoverable,
    methodPost: (form.attr('method') ?? '').toLowerCase() === 'post',
    actionPresent: !!action,
    actionWholeQueryBound: !!action && expected.origin === ORIGIN && expected.pathname === PATH
      && expected.searchParams.getAll('ProNum').length === 1 && [...expected.searchParams.keys()].length === 1
      && /^\d{8}$/.test(expected.searchParams.get('ProNum') ?? '') && action.href === url,
    answerNative: field.length === 1 && field.attr('name') === ANSWER && (field.attr('type') ?? 'text').toLowerCase() === 'text' && enabled(field[0]!),
    submitNative: submit.length === 1 && submit.attr('name') === SUBMIT && submit.attr('type')?.toLowerCase() === 'submit' && enabled(submit[0]!),
    submitValuePresent: submit.length === 1 && !!submit.attr('value') && submit.attr('value')!.length <= 100,
    imageSameOrigin: !!imageUrl && imageUrl.origin === ORIGIN && !imageUrl.hash && !imageUrl.username && !imageUrl.password,
    imageNativeRoute: !!imageUrl && imageUrl.pathname === RESOURCE && imageUrl.searchParams.getAll('type').length === 1
      && imageUrl.searchParams.get('type') === 'rca' && imageUrl.searchParams.getAll('guid').length === 1 && !!imageUrl.searchParams.get('guid'),
    hiddenNamesUnique: names.length === new Set(names).size,
    hiddenValuesBounded: hidden.every(node => ($(node).attr('value') ?? '').length <= AAA_COOPER_MAX_BYTES),
    viewstateComplete: segments.length > 0 && names.filter(name => /^__VIEWSTATE\d*$/.test(name)).length === segments.length
      && segments.every(name => values(name).length === 1 && !!values(name)[0]),
    eventValidationPresent: values('__EVENTVALIDATION').length === 1 && !!values('__EVENTVALIDATION')[0],
    viewstateGeneratorPresent: values('__VIEWSTATEGENERATOR').length === 1 && /^[a-f0-9]{8}$/i.test(values('__VIEWSTATEGENERATOR')[0]!),
    captchaClientStatePresent: values(`${ID}RadCaptcha1_ClientState`).length === 1,
    scriptManagerFieldPresent: scriptValues.length === 1,
    scriptResourceBound: filledScriptState || (sources.length === 1 && !!scriptUrl && scriptUrl.origin === ORIGIN && scriptUrl.pathname === RESOURCE
      && !scriptUrl.hash && !scriptUrl.username && !scriptUrl.password && scriptUrl.searchParams.getAll('_TSM_CombinedScripts_').length === 1
      && !!scriptUrl.searchParams.get('_TSM_CombinedScripts_') && scriptUrl.searchParams.getAll('_TSM_HiddenField_').length === 1
      && scriptUrl.searchParams.get('_TSM_HiddenField_') === TSM),
  };
  const controls: [string, string][] = [];
  for (const node of form.find('input[name],select[name],textarea[name],button[name]').toArray()) {
    const input = $(node), type = (input.attr('type') ?? (input.is('button') ? 'submit' : 'text')).toLowerCase();
    if (!enabled(node) || node === field[0] || node === submit[0] || ['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
    if (['file', 'password'].includes(type) || /phone|pin|otp|password|login/i.test(input.attr('name')!)) refused({ ...diagnostics, separateAccessRequirement: true });
    if (['checkbox', 'radio'].includes(type) && !input.is('[checked]')) continue;
    if (input.is('select')) {
      let selected = input.find('option[selected]');
      if (!selected.length && !input.is('[multiple]')) selected = input.find('option').first();
      for (const option of selected.toArray()) if (!$(option).is('[disabled]')) controls.push([input.attr('name')!, $(option).attr('value') ?? $(option).text()]);
    } else controls.push([input.attr('name')!, input.is('textarea') ? input.text() : input.attr('value') ?? '']);
  }
  if (form.length === 1 && action && !diagnostics.actionWholeQueryBound) {
    throw Object.assign(new SchemaError(PROVIDER, 'AAA Cooper returned another form target'), { diagnostics });
  }
  if (form.length !== 1 || field.length !== 1 || submit.length !== 1 || image.length !== 1
    || Object.values(diagnostics).some(value => typeof value === 'boolean' && !value)) refused(diagnostics);
  return { imageUrl: imageUrl!, puzzle: imageUrl!.searchParams.get('guid')!, scriptUrl: filledScriptState ? null : scriptUrl,
    scriptState: filledScriptState ? scriptValues[0]! : '', hidden: hidden.map(node => [$(node).attr('name')!, $(node).attr('value') ?? '']),
    controls, submitValue: submit.attr('value')!, diagnostics };
}

/** The carrier's combined script has one literal resource-list append; no script is evaluated. */
export function aaaCooperScriptState(source: string): string {
  const matches = [...source.matchAll(/hf\.value \+= '([^'\r\n]{1,4096})'/g)];
  const diagnostics = { sourceBounded: source.length <= 2 * AAA_COOPER_MAX_BYTES,
    hiddenFieldBindingPresent: source.includes('window.__TsmHiddenField'), appendCount: matches.length,
    singleSafeAppend: matches.length === 1 && !/[\\<>]/.test(matches[0]?.[1] ?? '') };
  if (Object.values(diagnostics).some(value => typeof value === 'boolean' && !value)) {
    throw Object.assign(new ChallengeError(PROVIDER, 'AAA Cooper script-manager state is unavailable'), { diagnostics });
  }
  return matches[0]![1]!;
}

export function aaaCooperPost(form: AaaCooperForm, answer: string, scriptState: string): URLSearchParams {
  if (!/^\d{6}$/.test(answer) || !scriptState || scriptState.length > 4096) throw new ChallengeError(PROVIDER, 'AAA Cooper text verification did not finish');
  const body = new URLSearchParams([...form.hidden, ...form.controls]);
  body.set(TSM, scriptState);
  body.append(ANSWER, answer);
  body.append(SUBMIT, form.submitValue);
  return body;
}
