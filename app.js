// Pitango-style game — Client-only, modular, light theme
// 今後の拡張（ゲーム画面・結果画面）を見据えて単純なView RouterとStoreを用意

(() => {
  // ===== Constants / Tokens =====
  const MAX_PLAYERS = 10, MIN_PLAYERS = 1;
  const STORAGE_KEY = 'pitango.lobbyState.v1';
  const SNAPSHOT_KEY = 'pitango.sessionSnapshot.v1';

  const colors = [
    '#60a5fa','#f472b6','#34d399','#fbbf24','#a78bfa','#fca5a5','#22d3ee','#fdba74','#86efac','#93c5fd'
  ];

  // ===== Store =====
  const state = {
    players: [], // {id, name, color}
    perHand: 7,
    seed: '',
    options: { challenges: true, timer: false, timerSec: 30 },
    cardsRaw: ''
  };

  const Store = {
    load() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      try {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') Object.assign(state, obj);
      } catch(_){}
    },
    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      UI.render();
      UI.flashNote('保存しました');
    },
    snapshotSession() {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
        players: state.players,
        perHand: state.perHand,
        seed: state.seed,
        options: state.options,
        cards: Utils.sanitizeCards(state.cardsRaw)
      }));
    }
  };

  // ===== Utils =====
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
  const uid = () => Math.random().toString(36).slice(2,9);

  const Utils = {
    sanitizeCards(raw) {
      return (raw || '').split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .filter((s, i, a) => a.indexOf(s) === i);
    },
    computeCounts() {
      const players = state.players.length;
      const perHand = Number(state.perHand)||0;
      const needed = players * perHand;
      const available = Utils.sanitizeCards(state.cardsRaw).length;
      return { players, perHand, needed, available };
    },
    validation() {
      const {players, perHand, needed, available} = Utils.computeCounts();
      if (players < MIN_PLAYERS) return { ok:false, msg:`プレイヤーが足りません（最少 ${MIN_PLAYERS} 人）`, level:'bad'};
      if (players > MAX_PLAYERS) return { ok:false, msg:`プレイヤーは最大 ${MAX_PLAYERS} 人です`, level:'bad'};
      if (perHand < 1) return { ok:false, msg:'配布枚数は1以上にしてください', level:'bad'};
      if (available === 0) return { ok:false, msg:'カードが未設定です', level:'warn'};
      if (available < needed) return { ok:false, msg:`カードが不足しています（必要 ${needed} / ある ${available}）`, level:'warn'};
      return { ok:true, msg:'開始できます', level:'ok'};
    }
  };

  // ===== UI (Lobby View) =====
  const UI = {
    init() {
      this.bind();
      Store.load();
      if (!state.cardsRaw) this.loadDefaultCards();
      if (state.players.length === 0) this.addPlayer('');
      this.renderAll();
    },
    bind() {
      $('#btnAdd').addEventListener('click', () => this.addPlayer(''));
      $('#btnClearPlayers').addEventListener('click', () => { state.players = []; this.renderPlayers(); this.persistDeferred(); });
      $('#btnShuffle').addEventListener('click', () => this.shufflePlayers());

      $('#perHand').addEventListener('input', e => { state.perHand = Math.max(1, Math.min(20, Number(e.target.value)||1)); this.updateStatsBar(); this.persistDeferred(); });
      $('#seed').addEventListener('input', e => { state.seed = e.target.value; this.persistDeferred(); });
      $('#optChallenges').addEventListener('change', e => { state.options.challenges = e.target.checked; this.persistDeferred(); });
      $('#optTimer').addEventListener('change', e => { state.options.timer = e.target.checked; this.persistDeferred(); });
      $('#timerSec').addEventListener('input', e => { state.options.timerSec = Math.max(5, Math.min(180, Number(e.target.value)||30)); this.persistDeferred(); });

      $('#btnLoadDefault').addEventListener('click', () => this.loadDefaultCards());
      $('#btnClean').addEventListener('click', () => { state.cardsRaw = Utils.sanitizeCards($('#cardText').value).join('\n'); this.renderCards(); this.persistDeferred(); });
      $('#cardText').addEventListener('input', () => { state.cardsRaw = $('#cardText').value; this.updateCardCount(); this.persistDeferred(); });

      $('#btnExport').addEventListener('click', () => {
        const blob = new Blob([state.cardsRaw||''], {type:'text/plain;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'cards.txt'; a.click();
        URL.revokeObjectURL(url);
      });

      $('#fileImport').addEventListener('change', async (ev) => {
        const f = ev.target.files[0]; if (!f) return;
        const text = await f.text();
        state.cardsRaw = text; this.renderCards(); this.persistDeferred();
        ev.target.value = '';
      });

      $('#btnStart').addEventListener('click', () => {
        const v = Utils.validation();
        if (!v.ok) { this.flashNote(v.msg); return; }
        Store.snapshotSession();
      });

      $('#btnSave').addEventListener('click', () => {
        UI.syncFromDOM();
        Store.save();
      });
      $('#btnReset').addEventListener('click', () => {
        if (!confirm('ロビーを初期化しますか？（保存内容は消えます）')) return;
        localStorage.removeItem(STORAGE_KEY);
        state.players = []; state.perHand = 7; state.seed = '';
        state.options = {challenges:true, timer:false, timerSec:30};
        state.cardsRaw = '';
        this.renderAll();
      });
    },

    // Player ops
    addPlayer(name='') {
      if (state.players.length >= MAX_PLAYERS) return;
      const idx = state.players.length % colors.length;
      state.players.push({ id: uid(), name, color: colors[idx] });
      this.renderPlayers();
      this.persistDeferred();
    },
    removePlayer(id) {
      state.players = state.players.filter(p => p.id !== id);
      this.renderPlayers();
      this.persistDeferred();
    },
    shufflePlayers() {
      const arr = state.players;
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      this.renderPlayers();
      this.persistDeferred();
    },

    renderPlayers() {
      const list = $('#playerList');
      list.innerHTML = '';
      const tpl = $('#tplPlayer');
      state.players.forEach((p, idx) => {
        const node = tpl.content.firstElementChild.cloneNode(true);
        node.dataset.id = p.id;
        node.querySelector('[data-role="swatch"]').style.background = p.color;
        const input = node.querySelector('[data-role="name"]');
        input.value = p.name || `プレイヤー${idx+1}`;
        input.addEventListener('input', () => { p.name = input.value; this.persistDeferred(); });
        node.querySelector('[data-role="remove"]').addEventListener('click', () => this.removePlayer(p.id));
        // drag to reorder
        node.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/plain', p.id); });
        node.addEventListener('dragover', ev => ev.preventDefault());
        node.addEventListener('drop', ev => {
          ev.preventDefault();
          const fromId = ev.dataTransfer.getData('text/plain');
          const toId = p.id;
          if (!fromId || fromId === toId) return;
          const a = state.players.findIndex(x => x.id === fromId);
          const b = state.players.findIndex(x => x.id === toId);
          const [m] = state.players.splice(a,1);
          state.players.splice(b,0,m);
          this.renderPlayers();
          this.persistDeferred();
        });
        list.appendChild(node);
      });
      $('#playerCount').textContent = `${state.players.length} 人`;
      this.updateStatsBar();
    },

    updateStatsBar() {
      const { perHand, needed, available } = Utils.computeCounts();
      $('#perHandValue').textContent = perHand;
      $('#needCards').textContent = needed;
      $('#availableCards').textContent = available;
      const v = Utils.validation();
      const msg = $('#validationMsg');
      msg.textContent = v.msg;
      msg.className = 'note ' + (v.level === 'ok' ? 'ok' : v.level === 'warn' ? 'warn' : 'bad');
      $('#btnStart').disabled = !v.ok;
    },

    renderCards() { $('#cardText').value = state.cardsRaw || ''; this.updateCardCount(); },
    updateCardCount() { const c = Utils.sanitizeCards($('#cardText').value).length; $('#cardCount').textContent = `${c} 枚`; this.updateStatsBar(); },

    loadDefaultCards() {
      const defaults = [
        '形のない','みんなの','空を飛ぶ','外国の','回る','おいしい','使うとなくなる','美しい','私の好きな',
        '赤い','青い','黒い','白い','大きい','小さい','長い','短い','速い','遅い','硬い','柔らかい','冷たい','温かい',
        '丸い','四角い','尖った','軽い','重い','薄い','厚い','新しい','古い','高い','安い',
        '季節の','学校の','家の','仕事の','旅行の','日本の','外国の町の','海の','山の','空の','地下の',
        '音の出る','光る','香る','動く','止まる','伸びる','縮む',
        '朝の','夜の','休日の','雨の日の','晴れの日の',
        '皆で使う','一人で使う','身につける','身近な','遠い',
        '甘い','酸っぱい','苦い','辛い','しょっぱい',
        '古典的な','最新の','人気の','珍しい','危ない','安全な',
        '動物の','植物の','機械の','食べ物の','飲み物の','道具の','場所の','イベントの'
      ];
      state.cardsRaw = defaults.join('\n');
      this.renderCards();
      this.persistDeferred();
    },

    flashNote(text) { $('#validationMsg').textContent = text; },

    renderAll() { this.renderPlayers(); this.renderCards(); this.updateStatsBar(); },

    persistDeferred: (() => {
      let t = null;
      return function() {
        clearTimeout(t);
        t = setTimeout(() => {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          UI.updateStatsBar();
        }, 200);
      }
    })(),

    render() { this.renderAll(); },

    syncFromDOM() {
      const perHandEl = $('#perHand');
      const seedEl = $('#seed');
      const challengesEl = $('#optChallenges');
      const timerEl = $('#optTimer');
      const timerSecEl = $('#timerSec');
      const cardsEl = $('#cardText');

      if (perHandEl) state.perHand = Math.max(1, Math.min(20, Number(perHandEl.value) || 1));
      if (seedEl) state.seed = seedEl.value || '';
      if (challengesEl) state.options.challenges = !!challengesEl.checked;
      if (timerEl) state.options.timer = !!timerEl.checked;
      if (timerSecEl) state.options.timerSec = Math.max(5, Math.min(180, Number(timerSecEl.value) || 30));
      if (cardsEl) state.cardsRaw = cardsEl.value ?? '';

      // プレイヤー名（DOM順に）を state へ反映
      const rows = $$('#playerList .player-item');
      rows.forEach((row, idx) => {
        const id = row.dataset.id;
        const nameInput = row.querySelector('[data-role="name"]');
        const p = state.players.find(x => x.id === id);
        if (p && nameInput) p.name = nameInput.value;
        // 並び順もDOMに合わせて揃える
        if (id && state.players[idx]?.id !== id) {
          const curIndex = state.players.findIndex(x => x.id === id);
          if (curIndex > -1) {
            const [m] = state.players.splice(curIndex, 1);
            state.players.splice(idx, 0, m);
          }
        }
      });
    }
  };

  // ===== Simple Router (placeholder) =====
  // 今後、ゲーム画面/結果画面に切替える場合は location.hash を利用する予定
  const Router = {
    init() { /* no-op for now */ },
    push(view) { location.hash = view; }
  };

  // ===== Init =====
  window.addEventListener('DOMContentLoaded', () => {
    UI.init();
    Router.init();
  });
})();


// ===== Game View =====
const Game = (() => {
  const GAME_KEY = 'pitango.gameState.v1';

  const game = {
    players: [], // {id,name,color}
    hands: {},   // playerId -> [{text, used:false}]
    currentWord: 'しりとり',
    history: []  // stack of {playerId, cardIdx, cardText, saidWord, prevWord}
  };

  function save() { localStorage.setItem(GAME_KEY, JSON.stringify(game)); }
  function load() {
    const raw = localStorage.getItem(GAME_KEY);
    if (!raw) return;
    try { Object.assign(game, JSON.parse(raw)); } catch(_){}
  }

  function prngFromSeed(seedStr) {
    if (!seedStr) return Math.random;
    // simple xorshift32 seeded by string hash
    let h = 2166136261 >>> 0;
    for (let i=0; i<seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    let x = h || 88675123;
    return function() { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x>>>0) / 0xFFFFFFFF); };
  }

  function shuffle(arr, rng=Math.random) {
    for (let i=arr.length-1; i>0; i--) { const j = Math.floor(rng()*(i+1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }

  function deal(snapshot) {
    const rng = prngFromSeed(snapshot.seed);
    const cards = snapshot.cards.slice();
    shuffle(cards, rng);
    const per = snapshot.perHand;
    const hands = {};
    snapshot.players.forEach(p => hands[p.id] = []);
    // round-robin deal
    for (let r=0; r<per; r++) {
      for (const p of snapshot.players) {
        if (cards.length === 0) break;
        hands[p.id].push({ text: cards.shift(), used: false });
      }
    }
    return hands;
  }

  function startFromSnapshot() {
    const snap = JSON.parse(localStorage.getItem('pitango.sessionSnapshot.v1') || 'null');
    if (!snap) { alert('ロビー設定が見つかりません。'); return null; }
    game.players = snap.players;
    game.hands = deal(snap);
    game.currentWord = snap.startWord || 'しりとり';
    game.history = [];
    save();
    return game;
  }

  function mount(container) {
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'game-header';

    const word = document.createElement('div');
    word.className = 'current-word';
    word.id = 'currentWord';
    word.textContent = `現在の単語：「${game.currentWord}」`;

    const ctrls = document.createElement('div');
    ctrls.className = 'game-controls';
    const undoBtn = document.createElement('button');
    undoBtn.className = 'btn';
    undoBtn.textContent = '戻す';
    undoBtn.addEventListener('click', () => undo());
    const backBtn = document.createElement('button');
    backBtn.className = 'btn ghost';
    backBtn.textContent = 'ロビーへ';
    backBtn.addEventListener('click', () => location.reload());
    ctrls.append(undoBtn, backBtn);

    header.append(word, ctrls);

    const grid = document.createElement('div');
    grid.className = 'game-layout';

    game.players.forEach(p => {
      const panel = document.createElement('section');
      panel.className = 'player-panel';
      const h3 = document.createElement('h3');
      const __idx = game.players.findIndex(x => x.id === p.id);
      const __disp = (p.name && p.name.trim()) ? p.name : `プレイヤー${__idx+1}`;
      h3.textContent = __disp;
      const cap = document.createElement('div');
      cap.className = 'small';
      cap.textContent = `残り ${game.hands[p.id].filter(c=>!c.used).length} / ${game.hands[p.id].length}`;
      const ul = document.createElement('ul');
      ul.className = 'hand';

      game.hands[p.id].forEach((card, idx) => {
        const li = document.createElement('li');
        li.className = 'card-item' + (card.used ? ' used' : '');
        const span = document.createElement('span');
        span.className = 'card-text';
        span.textContent = card.text;
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = card.used ? '使用済み' : '使う';
        btn.disabled = !!card.used;
        btn.addEventListener('click', () => useCard(p.id, idx));
        li.append(span, btn);
        ul.appendChild(li);
      });

      panel.append(h3, cap, ul);
      grid.appendChild(panel);
    });

    container.append(header, grid);
  }

  function useCard(playerId, cardIdx) {
    const card = game.hands[playerId][cardIdx];
    if (!card || card.used) return;
    const said = prompt(`このお題「${card.text}」から発言した単語を入力`, game.currentWord ? '' : '');
    if (said === null) return; // canceled
    const trimmed = (said||'').trim();
    if (!trimmed) return;

    const prev = game.currentWord;
    card.used = true;
    game.currentWord = trimmed;
    game.history.push({ playerId, cardIdx, cardText: card.text, saidWord: trimmed, prevWord: prev });
    save();
    // re-render minimal
    document.getElementById('currentWord').textContent = `現在の単語：「${game.currentWord}」`;
    refreshPlayerPanel(playerId);
  }

  function refreshPlayerPanel(playerId) {
    // naive re-render of the player's section for simplicity
    const container = document.querySelector('.game-layout');
    const idx = game.players.findIndex(p => p.id === playerId);
    if (idx === -1) return;
    const panel = container.children[idx];
    panel.querySelector('.small').textContent = `残り ${game.hands[playerId].filter(c=>!c.used).length} / ${game.hands[playerId].length}`;
    const ul = panel.querySelector('.hand');
    ul.innerHTML = '';
    game.hands[playerId].forEach((card, i) => {
      const li = document.createElement('li');
      li.className = 'card-item' + (card.used ? ' used' : '');
      const span = document.createElement('span');
      span.className = 'card-text';
      span.textContent = card.text;
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = card.used ? '使用済み' : '使う';
      btn.disabled = !!card.used;
      btn.addEventListener('click', () => useCard(playerId, i));
      li.append(span, btn);
      ul.appendChild(li);
    });
  }

  function undo() {
    const last = game.history.pop();
    if (!last) { alert('戻す対象がありません'); return; }
    // restore
    const card = game.hands[last.playerId][last.cardIdx];
    if (card) card.used = false;
    game.currentWord = last.prevWord;
    save();
    // rerender current word and affected panel
    document.getElementById('currentWord').textContent = `現在の単語：「${game.currentWord}」`;
    refreshPlayerPanel(last.playerId);
  }

  return {
    GAME_KEY, game, save, load, startFromSnapshot, mount
  };
})();

// Hook "開始" from Lobby to transition to game view
(function attachGameStart(){
  const startBtn = document.getElementById('btnStart');
  if (!startBtn) return;
  startBtn.addEventListener('click', () => {
    // augment snapshot with startWord
    const snapRaw = localStorage.getItem('pitango.sessionSnapshot.v1');
    if (snapRaw) {
      const snap = JSON.parse(snapRaw);
      const startWordInput = document.getElementById('startWord');
      snap.startWord = (startWordInput && startWordInput.value.trim()) || 'しりとり';
      localStorage.setItem('pitango.sessionSnapshot.v1', JSON.stringify(snap));
    }

    // swap to game view
    document.body.innerHTML = '';
    const root = document.createElement('div');
    root.style.padding = '24px';
    document.body.appendChild(root);

    const started = Game.startFromSnapshot();
    if (!started) return;
    Game.mount(root);
  }, { once: true });
})();
