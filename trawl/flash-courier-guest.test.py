import importlib.util
import json
from pathlib import Path
import unittest

B = Path(__file__).parent
spec = importlib.util.spec_from_file_location('flash', B / 'flash-courier-guest.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
N = 'SYNTHETIC123'
T = 'a' * 64
PNG = 'data:image/png;base64,iVBORw0KGgoAAAAAAAAAAAAAAAAAAAAAAAAA'

def page(number=N):
    return '<div id="fc-rastreio-config" data-path="/" data-codigo="'+number+'"></div><input id="codigo_rastreio" value="'+number+'"><input id="token" value=""><input id="captcha">'

def history(number=N):
    return '<div id="track-result"><span class="track-code">Código <b>12345678901</b></span><div class="track-extra-item"><span class="track-extra-label">Código do cliente</span><strong class="track-extra-value">'+number+'</strong></div><span class="track-status-pill">Pedido entregue</span><div class="track-timeline-item"><span class="track-timeline-status">Entrega efetuada com sucesso</span><span class="track-timeline-date">07/08/2026 08:57:50</span></div></div>'

class Cases(unittest.TestCase):
    def test_public_history_projection_excludes_hidden_and_contact_fields(self):
        html = history().replace('</div>', '<input value="secret"><script>secret</script></div>', 1)
        result = m.project_reply({'success': True, 'html': html, 'meta': {'recipient': 'private'}}, N)
        self.assertEqual(result['kind'], 'history')
        self.assertEqual(result['number'], N)
        self.assertEqual(result['events'][0]['clock'], '07/08/2026 08:57:50')
        self.assertNotIn('private', json.dumps(result))
        self.assertNotIn('secret', json.dumps(result))

    def test_wrong_body_identity(self):
        with self.assertRaisesRegex(ValueError, 'wrong_identity'):
            m.project_reply({'success': True, 'html': history('OTHER')}, N)

    def test_ambiguous_result_not_history(self):
        self.assertEqual(m.project_reply({'success': True, 'html': history(), 'meta': {'showHawbsModal': True}}, N)['kind'], 'ambiguous')

    def test_duplicate_or_malformed_event_rejected(self):
        with self.assertRaisesRegex(ValueError, 'event_shape'):
            m.project_reply({'success': True, 'html': history().replace('track-timeline-date', 'changed')}, N)

    def test_fresh_generation_after_refused_answer(self):
        calls = []
        def fetch(url, phase, data, headers, timeout):
            calls.append((phase, data))
            if phase == 'page': return 200, None, page().encode()
            if phase == 'generate': return 200, None, json.dumps({'token': ('a' if sum(1 for p, _ in calls if p == 'generate') == 1 else 'b') * 64, 'img': PNG}).encode()
            refusal = sum(1 for p, _ in calls if p == 'lookup') == 1
            return 422 if refusal else 200, None, json.dumps({'erro_captcha': True} if refusal else {'success': True, 'html': history()}).encode()
        result = m.run(N, 2000, fetcher=fetch, solver=lambda _: 'aB123')
        self.assertEqual([p for p, _ in calls], ['page', 'generate', 'lookup', 'generate', 'lookup'])
        self.assertEqual(result['captures'][0]['reply']['kind'], 'captcha_refused')
        self.assertEqual(result['captures'][1]['reply']['kind'], 'history')
        self.assertEqual(result['counts']['submits'], 2)

    def test_unreadable_does_not_submit_or_coerce(self):
        phases = []
        def fetch(url, phase, data, headers, timeout):
            phases.append(phase)
            return (200, None, page().encode()) if phase == 'page' else (200, None, json.dumps({'token': T, 'img': PNG}).encode())
        result = m.run(N, 2000, fetcher=fetch, solver=lambda _: 'aB12')
        self.assertEqual(phases, ['page', 'generate', 'generate'])
        self.assertEqual(result['counts']['submits'], 0)

    def test_rate_limit_does_not_repeat_generation(self):
        phases = []
        def fetch(url, phase, data, headers, timeout):
            phases.append(phase)
            return (200, None, page().encode()) if phase == 'page' else (429, '60', b'')
        result = m.run(N, 2000, fetcher=fetch)
        self.assertEqual(phases, ['page', 'generate'])
        self.assertEqual(result['diagnostic'], {'kind': 'http', 'status': 429, 'retryAfter': '60'})

    def test_lookup_http_error_is_not_reclassified_by_its_body(self):
        for status in (400, 403, 404, 429, 500):
            phases = []
            def fetch(url, phase, data, headers, timeout):
                phases.append(phase)
                if phase == 'page': return 200, None, page().encode()
                if phase == 'generate': return 200, None, json.dumps({'token': T, 'img': PNG}).encode()
                return status, '60', b'<html>refused</html>'
            result = m.run(N, 2000, fetcher=fetch, solver=lambda _: 'aB123')
            self.assertEqual(result['diagnostic'], {'kind': 'http', 'status': status, 'retryAfter': '60'})
            self.assertEqual(result['captures'][0]['status'], status)
            self.assertEqual(result['counts']['submits'], 1)

    def test_scalar_not_found_is_not_invented(self):
        result = m.project_reply({'success': False, 'html': '<p>No result</p>'}, N)
        self.assertEqual(result['kind'], 'unconfirmed')

    def test_unchanged_challenge_not_submitted_twice(self):
        phases = []
        def fetch(url, phase, data, headers, timeout):
            phases.append(phase)
            if phase == 'page': return 200, None, page().encode()
            if phase == 'generate': return 200, None, json.dumps({'token': T, 'img': PNG}).encode()
            return 422, None, json.dumps({'erro_captcha': True}).encode()
        result = m.run(N, 2000, fetcher=fetch, solver=lambda _: 'aB123')
        self.assertEqual(result['counts']['submits'], 1)
        self.assertEqual(result['diagnostic']['kind'], 'stale_challenge')

    def test_bad_input_makes_no_request(self):
        with self.assertRaisesRegex(ValueError, 'number_shape'):
            m.run('https://evil.invalid/', 2000, fetcher=lambda *a: self.fail('unexpected egress'))

    def test_unknown_schema_does_not_disclose_unrelated_text(self):
        result = m.project_reply({'success': False, 'html': '<p class="unknown">'+('a'*1200)+'</p><input value="secret"><script>secret</script>'}, N)
        self.assertNotIn('secret', json.dumps(result))
        self.assertNotIn('aaaa', json.dumps(result))
        self.assertEqual(result['kind'], 'unconfirmed')

    def test_explicit_number_bound_missing_contract(self):
        html = '<div class="track-notfound show"><h2>Código não encontrado</h2><p>Não localizamos nenhum envio com o código '+N+'.</p></div>'
        self.assertEqual(m.project_reply({'success': False, 'html': html}, N), {'kind': 'not_found', 'number': N})
        for wrong in [html.replace(N, 'OTHER123'), html.replace('show', ''), html.replace('class=', 'hidden class=')]:
            self.assertEqual(m.project_reply({'success': False, 'html': wrong}, N)['kind'], 'unconfirmed')

if __name__ == '__main__': unittest.main()
