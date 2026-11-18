"""Bounded public guest tracking with a fresh cookie jar and local five-character OCR."""
import base64
import gc
import hashlib
import io
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import http.cookiejar
from html.parser import HTMLParser

ORIGIN = 'https://www.flashcourier.com.br'
MAX_BODY = 1000000
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

class Node:
    def __init__(self, tag='', attrs=None):
        self.tag = tag
        self.attrs = dict(attrs or [])
        self.parts = []
    def text(self):
        if self.tag in ('script', 'style', 'iframe', 'input'):
            return ''
        return ''.join(p if isinstance(p, str) else p.text() for p in self.parts)
    def nodes(self):
        yield self
        for p in self.parts:
            if isinstance(p, Node):
                yield from p.nodes()
    def by_class(self, name):
        return [n for n in self.nodes() if name in n.attrs.get('class', '').split()]

class Document(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(html)
    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs)
        self.stack[-1].parts.append(n)
        if tag not in VOID:
            self.stack.append(n)
    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack = self.stack[:i]
                return
    def handle_data(self, data):
        self.stack[-1].parts.append(data)
    def by_id(self, name):
        return [n for n in self.root.nodes() if n.attrs.get('id') == name]

def clean(text, maximum=500):
    value = ' '.join(text.split())
    if not value or len(value) > maximum:
        raise ValueError('field_shape')
    return value

def bootstrap(html, number):
    doc = Document(html)
    cfg = doc.by_id('fc-rastreio-config')
    if len(cfg) != 1 or cfg[0].attrs.get('data-path') != '/' or cfg[0].attrs.get('data-codigo') != number:
        raise ValueError('page_identity')
    result = {}
    for key in ('codigo_rastreio', 'token', 'captcha'):
        found = doc.by_id(key)
        if len(found) != 1 or found[0].tag != 'input':
            raise ValueError('page_inputs')
        result[key] = found[0].attrs.get('value', '')
    if result['codigo_rastreio'] != number:
        raise ValueError('input_identity')
    if result['token'] and not re.fullmatch(r'[A-Za-z0-9._~=-]{40,4096}', result['token']):
        raise ValueError('token_shape')
    return result['token']

def project_reply(data, number):
    if not isinstance(data, dict):
        raise ValueError('reply_shape')
    if data.get('erro_captcha') in (True, 1):
        return {'kind': 'captcha_refused'}
    if isinstance(data.get('meta'), dict) and data['meta'].get('showHawbsModal'):
        return {'kind': 'ambiguous'}
    html = data.get('html')
    if not isinstance(html, str) or len(html) > MAX_BODY:
        return {'kind': 'unconfirmed', 'success': data.get('success') is True, 'htmlPresent': isinstance(html, str)}
    doc = Document(html)
    roots = doc.by_id('track-result')
    if len(roots) != 1:
        negative = doc.root.by_class('track-notfound')
        if not roots and len(negative) == 1 and data.get('success') is False:
            block = negative[0]
            text = ' '.join(block.text().split())
            echoed = re.findall(r'Não localizamos nenhum envio com o código ([A-Z0-9]{1,20})\.', text)
            shown = 'show' in block.attrs.get('class', '').split() and 'hidden' not in block.attrs \
                and block.attrs.get('aria-hidden') != 'true' and 'display:none' not in block.attrs.get('style', '').replace(' ', '')
            if shown and 'Código não encontrado' in text and echoed == [number]:
                return {'kind': 'not_found', 'number': echoed[0]}
        return {'kind': 'unconfirmed', 'success': data.get('success') is True, 'htmlPresent': True}
    root = roots[0]
    codes = root.by_class('track-code')
    if len(codes) != 1:
        raise ValueError('record_identity')
    values = [n for n in codes[0].nodes() if n.tag == 'b']
    if len(values) != 1:
        raise ValueError('record_identity')
    primary = clean(values[0].text(), 20)
    if not re.fullmatch(r'[A-Z0-9]{1,20}', primary):
        raise ValueError('record_identity')
    references = []
    for item in root.by_class('track-extra-item'):
        label = item.by_class('track-extra-label')
        value = item.by_class('track-extra-value')
        if len(label) == 1 and clean(label[0].text(), 80) == 'Código do cliente':
            if len(value) != 1:
                raise ValueError('reference_identity')
            references.append(clean(value[0].text(), 20))
    if len(references) > 1 or primary != number and references != [number]:
        raise ValueError('wrong_identity')
    entries = root.by_class('track-timeline-item')
    if len(entries) > 500:
        raise ValueError('history_shape')
    if not entries:
        return {'kind': 'empty_history', 'number': number, 'success': data.get('success') is True}
    events = []
    for item in entries:
        label, clock = item.by_class('track-timeline-status'), item.by_class('track-timeline-date')
        if len(label) != 1 or len(clock) != 1:
            raise ValueError('event_shape')
        events.append({'status': clean(label[0].text()), 'clock': clean(clock[0].text(), 80)})
    summaries = root.by_class('track-status-pill')
    summary = clean(summaries[0].text(), 100) if len(summaries) == 1 else None
    return {'kind': 'history', 'success': data.get('success') is True, 'number': number,
            'primaryNumber': primary, 'customerReference': references[0] if references else None,
            'summary': summary, 'events': events}

def read_image(value):
    if not isinstance(value, str):
        raise ValueError('image_shape')
    match = re.fullmatch(r'data:image/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)', value)
    if not match:
        raise ValueError('image_shape')
    raw = base64.b64decode(match[2], validate=True)
    if not 20 <= len(raw) <= 200000:
        raise ValueError('image_shape')
    return raw

def recognize(raw):
    from PIL import Image
    import onnxruntime
    image = Image.open(io.BytesIO(raw))
    if image.format not in ('PNG', 'JPEG') or not 10 <= image.width <= 2000 or not 10 <= image.height <= 500 or image.width * image.height > 500000:
        raise ValueError('image_geometry')
    image.load()
    image.close()
    original = onnxruntime.InferenceSession
    def limited(*args, **kwargs):
        options = onnxruntime.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        kwargs['sess_options'] = options
        return original(*args, **kwargs)
    onnxruntime.InferenceSession = limited
    try:
        import ddddocr
        model = ddddocr.DdddOcr(show_ad=False)
        answer = model.classification(raw)
        del model
        gc.collect()
        return answer if isinstance(answer, str) and re.fullmatch(r'[A-Za-z0-9]{5}', answer) else None
    finally:
        onnxruntime.InferenceSession = original

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def run(number, budget_ms, fetcher=None, solver=recognize):
    if not isinstance(number, str) or not re.fullmatch(r'[A-Z0-9]{1,20}', number):
        raise ValueError('number_shape')
    if type(budget_ms) is not int or not 1 <= budget_ms <= 60000:
        raise ValueError('budget_shape')
    started = time.monotonic()
    deadline = started + budget_ms / 1000
    jar = http.cookiejar.CookieJar()
    client = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(jar), NoRedirect())
    page_url = ORIGIN + '/rastreio/' + number
    result = {'protocol': 'flash-courier-guest-v1', 'requestedNumber': number, 'pageStatus': 0,
              'phase': 'page', 'diagnostic': None, 'captures': [], 'counts': {'images': 0, 'submits': 0, 'ocr': 0}}
    token = ''
    raw = b''
    answer = ''
    previous_generation = None

    def request(url, phase, data=None):
        result['phase'] = phase
        remaining = deadline - time.monotonic()
        if remaining < 0.3:
            raise TimeoutError('deadline')
        headers = {'User-Agent': 'Mozilla/5.0', 'Referer': page_url}
        if phase != 'page':
            headers.update({'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest'})
        if data is not None:
            headers.update({'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Origin': ORIGIN})
        if fetcher:
            return fetcher(url, phase, data, headers, min(12, remaining))
        req = urllib.request.Request(url, data=data, headers=headers)
        try:
            response = client.open(req, timeout=min(12, remaining))
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read(MAX_BODY + 1)
            if len(body) > MAX_BODY:
                raise ValueError('body_cap')
            return response.status, response.headers.get('Retry-After'), body

    try:
        status, retry, body = request(page_url, 'page')
        result['pageStatus'] = status
        if status != 200:
            result['diagnostic'] = {'kind': 'http', 'status': status, 'retryAfter': retry if retry and re.fullmatch(r'\d{1,6}', retry) else None}
            return result
        token = bootstrap(body.decode('utf-8'), number)
        for _ in range(2):
            status, retry, body = request(ORIGIN + '/api/captcha/generate/' + urllib.parse.quote(token, safe=''), 'generate')
            if status != 200:
                result['diagnostic'] = {'kind': 'http', 'status': status, 'retryAfter': retry if retry and re.fullmatch(r'\d{1,6}', retry) else None}
                return result
            generated = json.loads(body)
            if not isinstance(generated, dict) or not isinstance(generated.get('token'), str) or not re.fullmatch(r'[A-Za-z0-9._~=-]{40,4096}', generated['token']):
                raise ValueError('generation_shape')
            token = generated['token']
            raw = read_image(generated.get('img'))
            generation = hashlib.sha256(token.encode() + b'\0' + raw).digest()
            if generation == previous_generation:
                result['diagnostic'] = {'kind': 'stale_challenge'}
                return result
            previous_generation = generation
            result['counts']['images'] += 1
            result['counts']['ocr'] += 1
            result['phase'] = 'ocr'
            answer = solver(raw)
            raw = b''
            if not isinstance(answer, str) or not re.fullmatch(r'[A-Za-z0-9]{5}', answer):
                result['diagnostic'] = {'kind': 'unreadable'}
                continue
            result['counts']['submits'] += 1
            status, retry, body = request(ORIGIN + '/api/hawb/' + number + '/tipo/todos', 'lookup',
                                        urllib.parse.urlencode({'token': token, 'captcha': answer}).encode())
            answer = ''
            row = {'status': status, 'retryAfter': retry if retry and re.fullmatch(r'\d{1,6}', retry) else None, 'reply': None}
            result['captures'].append(row)
            if status not in (200, 422):
                result['diagnostic'] = {'kind': 'http', 'status': status, 'retryAfter': row['retryAfter']}
                return result
            row['reply'] = project_reply(json.loads(body), number)
            if row['reply']['kind'] == 'captcha_refused':
                result['diagnostic'] = {'kind': 'captcha_refused'}
                continue
            result['diagnostic'] = None
            return result
        return result
    except TimeoutError:
        result['diagnostic'] = {'kind': 'budget'}
        return result
    except urllib.error.URLError:
        result['diagnostic'] = {'kind': 'transport'}
        return result
    except Exception as error:
        result['diagnostic'] = {'kind': 'schema', 'code': str(error) if isinstance(error, ValueError) and str(error) in {
            'page_identity', 'page_inputs', 'input_identity', 'token_shape', 'reply_shape', 'field_shape', 'record_identity',
            'reference_identity', 'wrong_identity', 'history_shape', 'event_shape', 'image_shape', 'image_geometry', 'body_cap', 'generation_shape'} else 'unclassified'}
        return result
    finally:
        token = ''
        raw = b''
        answer = ''
        jar.clear()
        result['elapsedMs'] = round((time.monotonic() - started) * 1000)

if __name__ == '__main__':
    request = json.load(sys.stdin)
    print(json.dumps(run(request['number'], request['budgetMs'])))
