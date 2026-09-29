# -*- coding: utf-8 -*-
"""営業日マスタ（スプレッドシート）から calendar.json を作る。

なぜ静的ファイルにするか
  サイトから GAS を直接呼ぶと、1回あたり 2.5〜4秒かかる（実測 2026-09-29）。
  スプレッドシートの読み取りではなく、GAS のウェブアプリそのものの往復が重い。
  サーバ側にキャッシュを置いても 1 秒しか縮まなかった。
  GitHub Pages から静的ファイルとして配れば、CDN から数十ミリ秒で届く。

使い方
    cd hisago-lp
    python tools/build_calendar.py
    git add calendar.json && git commit -m "営業カレンダーを更新" && git push

いつ実行するか
  営業日マスタで休業日を足したり消したりしたあと。
  サイト側は、この JSON を読んだあと裏で GAS にも問い合わせて差分を拾うので、
  更新を忘れても最大30分ほどで追いつく。ただし初回表示はこの JSON が出る。
"""
import json
import urllib.request
import sys
import datetime

GAS = ('https://script.google.com/macros/s/'
       'AKfycbx_l9A9SVkyJrvZYmqvMrn0aOJ9w3EdE4rbmZSh1JK9VckiWaN2e9EUS4RXfkPnJ0nI/exec')

# 営業日マスタが持っている範囲を広めに取る。無い日は入らないだけ。
today = datetime.date.today()
FROM = (today.replace(day=1) - datetime.timedelta(days=120)).isoformat()
TO = (today.replace(day=1) + datetime.timedelta(days=500)).isoformat()

url = '%s?action=business_calendar&from=%s&to=%s&fresh=1' % (GAS, FROM, TO)
print('取得中 ...', FROM, '〜', TO)
with urllib.request.urlopen(url, timeout=90) as r:
    data = json.loads(r.read().decode('utf-8'))

if not data.get('ok'):
    print('失敗:', data)
    sys.exit(1)

cal = data.get('cal') or {}
if not cal:
    print('営業日マスタが空です。書き出しを中止します（既存のJSONを壊さないため）。')
    sys.exit(1)

# サイトが使うのは isOpen と memo だけ。軽くする。
slim = {}
for k in sorted(cal):
    v = cal[k]
    e = {'o': 1 if v.get('isOpen') else 0}
    if v.get('memo'):
        e['m'] = v['memo']
    slim[k] = e

out = {
    'generated': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
    'from': min(slim), 'to': max(slim), 'days': len(slim),
    'cal': slim,
}
with open('calendar.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))

closed = sum(1 for v in slim.values() if not v['o'])
print('書き出し: calendar.json')
print('  期間   : %s 〜 %s（%d日）' % (out['from'], out['to'], out['days']))
print('  休業日 : %d 日' % closed)
print('  生成   : %s' % out['generated'])
