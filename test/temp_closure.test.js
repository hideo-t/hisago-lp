// 臨時休業がサイトに出ること（2026-10-10）
//
// 白河店店長からの報告
//   「11/30(月) 臨時休業する事になり（白河店のみ）昨夜操作手順通り行いましたが
//     カレンダーに反映されませんでした」
//
// ★操作ミスではなかった。公開エンドポイントに聞くと、サーバは正しく返していた:
//     { store:'B', date:'2026-11-30', note:'設備点検のため…' }
//   出なかったのはサイトの表示側。
//     ・hero 直下の赤い帯（本来の表示場所）が「今日から7日」に限っていた
//       → 51日先は出ない
//     ・月のカレンダーは _temp を一度も見ていなかった
//     ・_temp が届いても帯しか塗り直していなかった
//
// ★ここで守ること
//   1. 今日以降の臨時休業が、遠い先のぶんでも帯に出ること（この報告の再発防止）
//   2. 直近と先の予定が見分けられること（全部同じ赤だと読まれなくなる）
//   3. 臨時休業は店舗ごと。1店だけの休業で その日を全部「休」にしないこと
//      （他2店のお客様が来なくなる＝売上を失う）
//   4. 終わった日のぶんを出さないこと
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// index.html の本物を、そのまま切り出して動かす（コピーを置くとズレる）
function fnOf(name) {
  const i = html.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'index.html に関数が無い: ' + name);
  let d = 0, started = false;
  for (let j = i; j < html.length; j++) {
    if (html[j] === '{') { d++; started = true; }
    else if (html[j] === '}') { d--; if (started && d === 0) return html.slice(i, j + 1); }
  }
  throw new Error('括弧が閉じていない: ' + name);
}

// 帯を描く。TODAY と _temp を差し替えて、出来上がったHTMLを返す。
function paintBanner(todayYmd, temp) {
  const el = {
    tempClose: { classList: { _s: new Set(), add(c) { this._s.add(c); },
                              remove(c) { this._s.delete(c); },
                              has(c) { return this._s.has(c); } } },
    tempCloseBody: { innerHTML: '' }
  };
  const p = todayYmd.split('-').map(Number);
  const mod = { exports: {} };
  // TC_MAX は本体の値をそのまま使う（テストで別の上限を決めない）
  const tcMax = Number((html.match(/const TC_MAX=(\d+);/) || [])[1]);
  assert.ok(tcMax > 0, 'TC_MAX が読めない');
  new Function('module', 'document', 'TODAY', 'wdNames', 'SLABEL', '_p2', '_temp', 'TC_MAX',
    fnOf('_esc') + ';' + fnOf('_paintTemp')
    + ';module.exports = _paintTemp;')(
    mod,
    { getElementById: (id) => el[id] || null },
    new Date(p[0], p[1] - 1, p[2]),
    ['日', '月', '火', '水', '木', '金', '土'],
    { A: '石川店', B: '白河店', C: '須賀川店' },
    (n) => (n < 10 ? '0' : '') + n,
    temp, tcMax);
  mod.exports();
  return { html: el.tempCloseBody.innerHTML, on: el.tempClose.classList.has('on') };
}

// 白河店店長が実際に登録したもの
const SHIRAKAWA = { store: 'B', date: '2026-11-30',
                    note: '設備点検のため臨時休業とさせていただきます' };

// ------------------------------------------------------------------
// 1. ★この報告の再発防止
// ------------------------------------------------------------------
test('[実行] ★51日先の臨時休業が帯に出る（出なかった不具合そのもの）', () => {
  const r = paintBanner('2026-10-10', [SHIRAKAWA]);
  assert.strictEqual(r.on, true, '帯が出ていない');
  assert.ok(r.html.indexOf('11月30日(月)') >= 0, '日付が出ていない: ' + r.html);
  assert.ok(r.html.indexOf('白河店') >= 0, '店名が出ていない');
  assert.ok(r.html.indexOf('設備点検') >= 0, '理由が出ていない');
});

test('[実行] ★先の予定は「このあと」と分かる（直近と見分ける）', () => {
  // 全部を同じ強さの赤で出すと、いつも赤い帯になって読まれなくなる。
  const far = paintBanner('2026-10-10', [SHIRAKAWA]);
  assert.ok(far.html.indexOf('このあと') >= 0, '先の予定だと分からない');
  assert.ok(far.html.indexOf('class="far"') >= 0, '控えめな見せ方になっていない');

  // 直近（7日以内）は「このあと」を付けない
  const near = paintBanner('2026-11-28', [SHIRAKAWA]);
  assert.strictEqual(near.html.indexOf('このあと'), -1, '直近に「このあと」が付いている');
  assert.ok(near.html.indexOf('class="now"') >= 0, '直近が強い見せ方になっていない');
});

test('[実行] 当日は「本日」と出る', () => {
  const r = paintBanner('2026-11-30', [SHIRAKAWA]);
  assert.ok(r.html.indexOf('本日') >= 0, '当日が「本日」になっていない');
});

test('[実行] ★終わった日のぶんは出さない', () => {
  const r = paintBanner('2026-12-01', [SHIRAKAWA]);
  assert.strictEqual(r.on, false, '過ぎた臨時休業を出している');
  assert.strictEqual(r.html, '');
});

test('[実行] 1件も無ければ帯ごと出さない', () => {
  const r = paintBanner('2026-10-10', []);
  assert.strictEqual(r.on, false);
});

test('[実行] 多いときは4件まで。残りは件数で添える', () => {
  // 帯が画面を埋めないように。
  const many = ['2026-11-01', '2026-11-05', '2026-11-10', '2026-11-15', '2026-11-20', '2026-11-30']
    .map(d => ({ store: 'B', date: d, note: '' }));
  const r = paintBanner('2026-10-10', many);
  assert.strictEqual((r.html.match(/臨時休業とさせて/g) || []).length, 4, '4件に絞っていない');
  assert.ok(r.html.indexOf('ほか 2件') >= 0, '残りの件数を出していない');
});

test('[実行] 複数店が同じ日に休んでも、店名をそれぞれ出す', () => {
  const r = paintBanner('2026-11-28', [
    { store: 'B', date: '2026-11-30', note: '設備点検' },
    { store: 'C', date: '2026-11-30', note: '断水' }]);
  assert.ok(r.html.indexOf('白河店') >= 0 && r.html.indexOf('須賀川店') >= 0,
    '店ごとに出していない');
});

// ------------------------------------------------------------------
// 2. ★月のカレンダーにも出る（店舗ごとであること）
// ------------------------------------------------------------------
test('★月のカレンダーが臨時休業を見ている', () => {
  // 2026-10-10 まで _paint は _temp を一度も参照していなかった。
  // サイトの文章は「連休・臨時休業・年末年始も、このカレンダーで」と約束している。
  const b = fnOf('_paint');
  assert.ok(b.indexOf("_temp") >= 0, '月のカレンダーが臨時休業を見ていない');
  assert.ok(b.indexOf("classList.add('temp')") >= 0, '臨時休業の印を付けていない');
});

test('★1店だけの休業で、その日を全部「休」にしていない', () => {
  // 臨時休業は店舗ごとの管理（社長確認 2026-10-10）。
  // 1店だけの休業でその日を赤くすると、他2店のお客様が来なくなる＝売上を失う。
  const b = fnOf('_paint');
  // 営業／休の判定は営業日マスタ（rec.isOpen）だけで決める
  assert.ok(/const isOpen = rec \? !!rec\.isOpen : \(dow!==2\);/.test(b),
    '営業／休の判定に臨時休業が混ざっている');
  // 臨時休業は classList.add('closed') を増やさない
  const after = b.slice(b.indexOf('const tmp='));
  assert.strictEqual(after.indexOf("classList.add('closed')"), -1,
    '臨時休業で「休」にしている（他店のお客様を失う）');
  // 店名を出している
  assert.ok(b.indexOf('SSHORT') >= 0, 'セルに店名を出していない');
  assert.ok(b.indexOf("'全店休'") >= 0, '全店そろったときの表示が無い');
});

test('★臨時休業が届いたら、カレンダーも塗り直す', () => {
  // _paintTemp() だけでは帯しか変わらず、カレンダーが古いまま残っていた。
  assert.ok(/_temp=d\.temp; _paintTemp\(\); _paint\(_cal\);/.test(html),
    '臨時休業を受け取ってもカレンダーを塗り直していない');
});

test('★凡例に臨時休業がある', () => {
  assert.ok(html.indexOf('＝臨時休業（店名を表示）') >= 0, '凡例に無い（黄枠の意味が分からない）');
  assert.ok(/\.dot\.temp\{/.test(html), '凡例の見本が無い');
});

test('★臨時休業は静的JSONに入れない（速報性）', () => {
  // calendar.json は push しないと変わらない。臨時休業は登録した直後に出す必要がある。
  assert.ok(html.indexOf('臨時休業は静的JSONに入れない') >= 0, '方針のコメントが消えている');
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'calendar.json'), 'utf8'));
  assert.strictEqual(j.temp, undefined, '静的JSONに臨時休業が入っている（古いまま出る）');
});
