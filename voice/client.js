import { API_BASE_URL } from './config.js';
import { VoiceAudio, audioDiagnostic } from './audio.js';
import { SocketRpc } from './socket-rpc.js';
import { Device } from './vendor/mediasoup-client.js';
import { MediasoupVoice } from './mediasoup-voice.js';
import { canHear, distanceMeters, fresh, validateFrame, STALE_MS } from './policy.js';

const ui = Object.fromEntries(['join-form','player-select','refresh-players','roster-note','no-voice','microphone','join','leave','resume-audio','status','status-led','service-note','feedback','restore','self-state','players','players-empty','copy-command','diagnostic','diagnostic-results','diagnostic-details','diagnostic-values'].map(id => [id, document.getElementById(id)]));
let current = null;
let generation = 0;
let lastPlayersView = '';
let refreshing = false;

function endpoint() {
  if (!API_BASE_URL) return null;
  const url = new URL('client', API_BASE_URL.replace(/\/?$/, '/'));
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('A hangszolgáltatáshoz HTTPS cím szükséges.');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}
let socketUrl;
try { socketUrl = endpoint(); } catch (error) { ui.feedback.textContent = error.message; }
const supported = Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.AudioContext && window.RTCPeerConnection);
ui['service-note'].textContent = !socketUrl ? 'A hangszolgáltatás még nincs beállítva. A csatlakozás egyelőre nem érhető el.' : !supported ? 'A térhanghoz HTTPS és WebRTC / Web Audio támogatás szükséges.' : 'A mikrofon csak a csatlakozás gomb megnyomásakor indul.';
function selectablePlayer() { return ui['player-select'].value && !ui['player-select'].selectedOptions[0]?.disabled; }
function updateJoinButton() {
  ui.join.disabled = Boolean(current) || refreshing || !socketUrl || (!supported && !ui['no-voice'].checked) || !selectablePlayer();
  ui.join.textContent = ui['no-voice'].checked ? 'NO VOICE választás és csatlakozás' : 'Mikrofon engedélyezése és csatlakozás';
  ui.microphone.disabled = Boolean(current) || ui['no-voice'].checked;
}
async function refreshPlayers() {
  if (current || refreshing || !socketUrl) return;
  refreshing = true;
  ui['refresh-players'].disabled = true;
  ui['player-select'].disabled = true;
  updateJoinButton();
  ui['roster-note'].textContent = 'Játékoslista frissítése…';
  const selected = ui['player-select'].value, controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(new URL('players', API_BASE_URL.replace(/\/?$/, '/')), { cache:'no-store', credentials:'omit', signal:controller.signal });
    if (!response.ok && response.status !== 503) throw new Error('A játékoslista nem érhető el.');
    const roster = await response.json();
    if (typeof roster?.available !== 'boolean' || !Array.isArray(roster.players) || roster.players.length > 32
      || roster.players.some(p => !p || typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(p.id) || typeof p.name !== 'string' || p.name.length > 100 || typeof p.paired !== 'boolean')
      || new Set(roster.players.map(p => p.id)).size !== roster.players.length) throw new Error('Hibás játékoslista érkezett.');
    const players = roster.available ? roster.players : [];
    ui['player-select'].replaceChildren(new Option('Válaszd ki a saját játékosod…', ''));
    players.forEach((player, index) => {
      const duplicate = players.filter(p => p.name === player.name).length > 1;
      const option = new Option(`${player.name || 'Névtelen játékos'}${duplicate ? ` · #${index + 1}` : ''}${player.paired ? ' · foglalt' : ''}`, player.id);
      option.disabled = player.paired;
      ui['player-select'].add(option);
    });
    if (players.some(player => player.id === selected && !player.paired)) ui['player-select'].value = selected;
    ui['roster-note'].textContent = !roster.available ? 'A játék kapcsolata most nem elérhető. Próbáld újra a Frissítés gombbal.' : players.length ? `${players.length} játékos a szerveren. Később csatlakoztál? Frissítsd a listát.` : 'Még nincs játékos a szerveren. Lépj be, majd nyomd meg a Frissítés gombot.';
  } catch (error) {
    ui['player-select'].replaceChildren(new Option('A lista most nem érhető el', ''));
    ui['roster-note'].textContent = error.name === 'AbortError' ? 'A lista lekérése túl sokáig tartott. Próbáld újra a Frissítés gombbal.' : error.message;
  } finally { clearTimeout(timer); refreshing = false; ui['player-select'].disabled = Boolean(current); ui['refresh-players'].disabled = Boolean(current) || !socketUrl; updateJoinButton(); }
}
updateJoinButton();
ui['refresh-players'].disabled = !socketUrl;

function status(text, state) {
  ui.status.textContent = text;
  ui['status-led'].dataset.state = state;
}
function alive(session) { return current === session && session.generation === generation; }
function active(session) { return alive(session) && session.media?.connected && session.socket?.readyState === WebSocket.OPEN && session.audio.context?.state === 'running'; }
function reportReadiness(session, force = false) {
  if (!alive(session) || session.mode !== 'voice' || !session.playerId || !session.rpc || session.socket?.readyState !== WebSocket.OPEN || session.readyInFlight) return;
  const now = performance.now();
  const ready = Boolean(active(session) && fresh(now, session.receivedAt) && session.audio.capture?.getAudioTracks().some(track => track.readyState === 'live'));
  if (!force && ready === session.lastReady && now - session.lastReadyReport < 2000) return;
  session.readyInFlight = true;
  session.lastReady = ready;
  session.lastReadyReport = now;
  session.rpc.request('client_ready', { ready }).then(result => {
    if (alive(session) && typeof result?.ready !== 'boolean') throw new Error('Hibás voice állapotválasz.');
  }).catch(error => { if (alive(session)) void leave('A voice állapot nem igazolható. Kapcsolódj újra azonnal.', true); })
    .finally(() => { session.readyInFlight = false; });
}
function updateAudio(session) {
  const self = session.players.find(player => player.id === session.playerId);
  session.audio.update(self, session.players, session.receivedAt, performance.now(), active(session));
}

function renderPlayers(session) {
  if (session?.mode === 'no_voice') {
    ui['self-state'].textContent = 'NO VOICE · mikrofon nélkül';
    ui.players.replaceChildren();lastPlayersView = '';
    ui['players-empty'].hidden = false;
    ui['players-empty'].textContent = 'NO VOICE: nem hallasz senkit, és téged sem hall senki. A neved mellett a játékban (NO VOICE) látszik.';
    return;
  }
  const self = session?.players.find(player => player.id === session.playerId);
  const valid = session && fresh(performance.now(), session.receivedAt);
  ui['self-state'].textContent = !session ? 'Mikrofon: kikapcsolva' : !valid ? 'Mikrofon: nincs friss játékállapot' : !self?.alive ? 'Mikrofon: halott / néző' : self.muted ? 'Mikrofon: admin által némítva' : !active(session) ? 'Mikrofon: hangkapcsolatra vár' : self.speaking ? 'Mikrofon: beszéd továbbítva' : 'Mikrofon: beszédgombra vár';
  const players = valid ? session.players.filter(peer => canHear(self, peer)) : [];
  const view = JSON.stringify(players.map(peer => [peer.id, peer.name, peer.speaking, (distanceMeters(self.pos, peer.pos)).toFixed(1), session.receivers.get(peer.id)?.ready === true]));
  if (view !== lastPlayersView) {
    lastPlayersView = view;
    ui.players.replaceChildren();
    for (const peer of players) {
      const row = document.createElement('li');
      const led = document.createElement('span');
      led.className = `player-led${peer.speaking ? ' speaking' : ''}`;
      led.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = peer.name;
      const detail = document.createElement('span');
      detail.className = 'player-detail';
      detail.textContent = `${distanceMeters(self.pos, peer.pos).toFixed(1)} m · ${session.receivers.get(peer.id)?.ready ? (peer.speaking ? 'beszél' : 'csendben') : 'hangkapcsolat…'}`;
      row.append(led, name, detail);
      ui.players.append(row);
    }
  }
  ui['players-empty'].hidden = players.length > 0;
  ui['players-empty'].textContent = !session ? 'Párosítás után itt jelennek meg a hallható játékosok.' : !valid ? 'Nincs friss játékállapot. Minden hangút lezárva.' : !self?.alive ? 'Halottként és nézőként a térhang néma.' : 'Nincs párosított, élő játékos 20 méteren belül.';
}

function closeReceiver(session, peerId) { session.media?.remove(peerId); }
async function subscribe(session, peer) {
  try {
    await session.media.consume(peer.id);
  } catch (error) {
    if (alive(session)) {
      closeReceiver(session, peer.id);
      session.retryAfter.set(peer.id, performance.now() + 2000);
      ui.feedback.textContent = 'Egy közeli játékos hangkapcsolata még nem elérhető; újrapróbáljuk.';
      renderPlayers(session);
    }
  }
}
function reconcile(session) {
  const self = session.players.find(player => player.id === session.playerId);
  const authorized = new Map(session.players.filter(peer => peer.published === true && canHear(self, peer)).map(peer => [peer.id, peer]));
  if (!fresh(performance.now(), session.receivedAt) || !active(session)) authorized.clear();
  for (const id of session.receivers.keys()) if (!authorized.has(id)) closeReceiver(session, id);
  for (const [id, peer] of authorized) {
    if (!session.receivers.has(id) && performance.now() >= (session.retryAfter.get(id) || 0)) void subscribe(session, peer);
  }
}

function openSocket(session) {
  return new Promise((resolve, reject) => {
    session.socket = new WebSocket(socketUrl);
    session.rpc = new SocketRpc(session.socket, { onTimeout:() => {
      if (alive(session)) void leave('A hangszolgáltatás nem válaszolt időben. Válaszd ki magad újra az oldalon.', true);
    } });
    const timer = setTimeout(() => reject(new Error('A játékbeli jóváhagyás lejárt. Kapcsolódj újra, majd írd be a játékban: !voice.')), 65000);
    let joined = false;
    session.socket.onopen = () => {
      if (!alive(session)) return;
      session.socket.send(JSON.stringify({ type:'request_pair', playerId:session.selectedPlayer, mode:session.mode }));
    };
    session.socket.onmessage = event => {
      if (!alive(session)) return;
      try {
        if (typeof event.data !== 'string' || new TextEncoder().encode(event.data).length > 65536) throw new Error('Hibás hangszolgáltatási üzenet.');
        const message = JSON.parse(event.data);
        if (message.type === 'reply') session.rpc.reply(message);
        else if (message.type === 'pair_pending' && !joined) {
          if (message.playerId !== session.selectedPlayer) throw new Error('A kiválasztott játékos megváltozott.');
          status('Játékbeli jóváhagyásra vár: !voice', 'busy');
          ui.feedback.textContent = 'Térj vissza a CS2-be, és a chatbe írd: !voice. 60 másodperced van a saját kapcsolódásod jóváhagyására.';
        } else if (message.type === 'joined') {
          if (joined || message.playerId !== session.selectedPlayer || (message.mode || 'voice') !== session.mode || (session.mode === 'voice' && (!message.routerRtpCapabilities || !Array.isArray(message.routerRtpCapabilities.codecs)))) throw new Error('Hibás párosítási válasz.');
          joined = true;
          clearTimeout(timer);
          session.playerId = message.playerId;
          session.routerRtpCapabilities = message.routerRtpCapabilities;
          resolve();
        } else if (message.type === 'frame' && joined && session.mode === 'voice') {
          if (!validateFrame(message)) throw new Error('Hibás játékállapot: a hangút lezárult.');
          if (session.epoch && session.epoch !== message.epoch) throw new Error('A játékszerver újraindult. Válaszd ki magad újra a listából.');
          if (message.seq <= session.seq) return;
          session.epoch = message.epoch;
          session.seq = message.seq;
          if (!message.players.some(player => player.id === session.playerId)) throw new Error('A játékos már nincs a szerveren.');
          session.players = message.players;
          session.receivedAt = performance.now();
          clearTimeout(session.staleTimer);
          session.staleTimer = setTimeout(() => {
            if (!alive(session)) return;
            session.audio.silence();
            reconcile(session);
            renderPlayers(session);
            status('Játékállapotra vár · hang némítva', 'busy');
            reportReadiness(session, true);
          }, STALE_MS);
          updateAudio(session);
          reconcile(session);
          renderPlayers(session);
          if (active(session)) status('Kapcsolódva · játékállapot élő', 'connected');
          reportReadiness(session);
        } else if (message.type === 'voice' && joined && typeof message.speaking === 'boolean') {
          const player = session.players.find(player => player.id === message.id);
          if (player) { player.speaking = message.speaking; updateAudio(session); renderPlayers(session); }
        } else if (message.type === 'revoked') {
          const receiver = session.receivers.get(message.peerId);
          if (receiver && (receiver.id === null || receiver.id === message.consumerId)) closeReceiver(session, message.peerId);
          renderPlayers(session);
        } else if (message.type === 'error') throw new Error(typeof message.message === 'string' ? message.message : 'A párosítás sikertelen.');
      } catch (error) {
        clearTimeout(timer);
        reject(error);
        void leave(error.message, true);
      }
    };
    session.socket.onclose = () => {
      clearTimeout(timer);
      session.rpc.close();
      reject(new Error('A párosítási kapcsolat megszakadt.'));
      if (alive(session)) void leave(session.mode === 'no_voice' && joined ? 'NO VOICE módban nem volt hangküldés vagy vétel. Váltáshoz a játékban !voiceleave, majd válassz újra.' : 'A hangkapcsolat véget ért. Ha az admin kikapcsolta a voicechatet, állítsd vissza a CS2 beszédhangerőt. Egyébként csatlakozz újra azonnal, majd a játékban !voice.', session.mode !== 'no_voice');
    };
    session.socket.onerror = () => {
      session.audio.silence();
      clearTimeout(timer);
      reject(new Error('A hangszolgáltatás nem érhető el.'));
      if (alive(session)) void leave('A hangszolgáltatás nem érhető el.', true);
    };
  });
}

async function join(event) {
  event.preventDefault();
  if (current || refreshing || !socketUrl || (!supported && !ui['no-voice'].checked)) return;
  const selectedPlayer = ui['player-select'].value;
  if (!selectablePlayer()) { ui['player-select'].focus(); return; }
  const session = { generation:++generation, audio:new VoiceAudio({ onDecoderFailure:() => {
    if (alive(session)) void leave('A böngésző nem tudta elindítani a térhang vételét. Válaszd ki magad újra az oldalon.', true);
  } }), mode:ui['no-voice'].checked ? 'no_voice' : 'voice', selectedPlayer, players:[], playerId:null, receivedAt:-Infinity, seq:-1, epoch:null, receivers:new Map(), retryAfter:new Map(), abort:new AbortController(), lastReadyReport:-Infinity };
  current = session;
  ui.join.disabled = true;
  ui['player-select'].disabled = true;
  ui['refresh-players'].disabled = true;
  ui['no-voice'].disabled = true;
  ui.microphone.disabled = true;
  ui.leave.disabled = false;
  ui.restore.hidden = true;
  ui.feedback.textContent = session.mode === 'no_voice' ? 'NO VOICE választás. Mikrofont nem kérünk; a játékban !voice paranccsal hagyd jóvá.' : 'Engedélyezd a mikrofont a böngésző kérdésénél.';
  status(session.mode === 'no_voice' ? 'NO VOICE jóváhagyás indítása…' : 'Mikrofon és párosítás indítása…', 'busy');
  try {
    if (session.mode === 'no_voice') {
      await openSocket(session);
      if (!alive(session)) return;
      status('NO VOICE · a választásod rögzítve', 'connected');
      ui.feedback.textContent = 'Mikrofon nélkül játszol: nincs hangküldés vagy vétel. A meccs így is indulhat. Váltáshoz játékban !voiceleave, majd új választás.';
      renderPlayers(session);
      return;
    }
    // Both start in the same click gesture. Every subsequent await checks session identity.
    const capture = session.audio.start(ui.microphone.value).then(track => {
      if (!alive(session)) return track;
      const rawTracks = session.audio.capture.getTracks();
      rawTracks.forEach(rawTrack => rawTrack.addEventListener('ended', () => { if (alive(session)) void leave('A mikrofon hozzáférése megszűnt.', true); }, { once:true }));
      if (track.readyState !== 'live' || rawTracks.some(rawTrack => rawTrack.readyState !== 'live')) throw new Error('A mikrofon hozzáférése megszűnt.');
      return track;
    });
    const [track] = await Promise.all([capture, openSocket(session)]);
    if (!alive(session)) return;
    void microphones();
    status('Párosítva · hangkapcsolat felépítése…', 'busy');
    ui.feedback.textContent = 'A mikrofon a CS2 beszédjelére vár.';
    session.media = new MediasoupVoice({ Device, rpc:session.rpc, audio:session.audio, signal:session.abort.signal, isLive:() => alive(session),
      onFailure:error => { if (alive(session)) void leave(error.message, true); },
      onChange:() => {
        if (!alive(session)) return;
        updateAudio(session);
        reconcile(session);
        renderPlayers(session);
        reportReadiness(session, true);
        status(active(session) && fresh(performance.now(), session.receivedAt) ? 'Kapcsolódva · játékállapot élő' : 'Párosítva · hangkapcsolatra vár', active(session) && fresh(performance.now(), session.receivedAt) ? 'connected' : 'busy');
      }
    });
    session.receivers = session.media.receivers;
    session.audio.context.onstatechange = () => {
      if (!alive(session)) return;
      ui['resume-audio'].hidden = session.audio.context.state === 'running';
      if (session.audio.context.state !== 'running') { session.audio.silence(); status('A böngésző felfüggesztette a hangot', 'busy'); }
      else updateAudio(session);
      reportReadiness(session, true);
    };
    await session.media.start(session.routerRtpCapabilities, track);
    if (!alive(session)) return;
    updateAudio(session);
    reconcile(session);
    renderPlayers(session);
    reportReadiness(session, true);
    session.readyTimer = setInterval(() => reportReadiness(session), 2000);
    status(active(session) && fresh(performance.now(), session.receivedAt) ? 'Kapcsolódva · játékállapot élő' : 'Párosítva · hangkapcsolatra vár', active(session) && fresh(performance.now(), session.receivedAt) ? 'connected' : 'busy');
    ui.feedback.textContent = 'Térj vissza a CS2-be, és használd a megszokott beszédgombot. A lap maradjon nyitva.';
  } catch (error) {
    if (alive(session)) {
      const message = error.name === 'NotAllowedError' ? 'A mikrofon engedélye hiányzik. Engedélyezd a böngésző oldalbeállításaiban, majd kapcsolódj újra.' : error.name === 'NotFoundError' ? 'Nem található mikrofon. Csatlakoztass egyet, majd kapcsolódj újra.' : error.message;
      await leave(message, true);
    }
  }
}

async function leave(message = 'A kapcsolat bontva. A mikrofon kikapcsolva.', error = false) {
  const session = current;
  current = null;
  ++generation;
  if (session) {
    session.audio.silence();
    clearTimeout(session.staleTimer);
    clearInterval(session.readyTimer);
    session.abort.abort();
    for (const id of [...session.receivers.keys()]) closeReceiver(session, id);
    session.media?.close();
    if (session.socket?.readyState === WebSocket.OPEN) session.socket.send(JSON.stringify({ type:'leave' }));
    session.rpc?.close();
    session.socket?.close();
    void session.audio.close().catch(() => {});
  }
  ui['player-select'].disabled = false;
  ui['refresh-players'].disabled = !socketUrl;
  ui['no-voice'].disabled = false;
  ui['no-voice'].checked = false;
  updateJoinButton();
  ui.microphone.disabled = false;
  ui.leave.disabled = true;
  ui['resume-audio'].hidden = true;
  ui.restore.hidden = !session;
  ui.feedback.textContent = message;
  status(error ? 'Nincs kapcsolat · hang lezárva' : 'Nincs kapcsolat', error ? 'error' : 'idle');
  renderPlayers(null);
  void refreshPlayers();
}

async function microphones() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const selected = ui.microphone.value;
    const devices = await navigator.mediaDevices.enumerateDevices();
    ui.microphone.replaceChildren(new Option('Rendszer alapértelmezett mikrofonja', ''));
    devices.filter(device => device.kind === 'audioinput' && device.deviceId && device.deviceId !== 'default').forEach((device, index) => ui.microphone.add(new Option(device.label || `Mikrofon ${index + 1}`, device.deviceId)));
    if ([...ui.microphone.options].some(option => option.value === selected)) ui.microphone.value = selected;
  } catch { /* Device names remain optional until permission is granted. */ }
}
ui['join-form'].addEventListener('submit', join);
ui['player-select'].addEventListener('change', updateJoinButton);
ui['no-voice'].addEventListener('change', updateJoinButton);
ui['refresh-players'].addEventListener('click', () => void refreshPlayers());
ui.leave.addEventListener('click', () => void leave());
ui['resume-audio'].addEventListener('click', () => {
  const session = current;
  if (!session?.audio.context) return;
  session.audio.context.resume().then(() => {
    if (!alive(session)) return;
    updateAudio(session);
    reconcile(session);
    renderPlayers(session);
  }).catch(() => { ui.feedback.textContent = 'A hang folytatása nem sikerült. Bontsd a kapcsolatot, és párosíts újra.'; });
});
ui['copy-command'].addEventListener('click', async () => {
  try { await navigator.clipboard.writeText('snd_voipvolume 0'); ui['copy-command'].querySelector('span').textContent = 'Másolva'; }
  catch { ui.feedback.textContent = 'Másold ki a parancsot: snd_voipvolume 0'; }
});
ui.diagnostic.addEventListener('click', async () => {
  ui.diagnostic.disabled = true;
  ui['diagnostic-results'].replaceChildren();
  ui['diagnostic-details'].hidden = true;
  try {
    const result = await audioDiagnostic();
    for (const check of result.checks) {
      const row = document.createElement('li');
      row.textContent = `${check.ok ? 'OK' : 'HIBA'} · ${check.name}`;
      if (!check.ok) row.className = 'failed';
      ui['diagnostic-results'].append(row);
    }
    ui['diagnostic-values'].textContent = JSON.stringify(result.samples, null, 2);
    ui['diagnostic-details'].hidden = false;
  } catch (error) { const row = document.createElement('li'); row.className = 'failed'; row.textContent = `Az offline ellenőrzés nem érhető el: ${error.message}`; ui['diagnostic-results'].append(row); }
  finally { ui.diagnostic.disabled = false; }
});
window.addEventListener('pagehide', () => void leave());
document.addEventListener('visibilitychange', () => { if (current) { updateAudio(current); renderPlayers(current); } });
void microphones();
renderPlayers(null);
void refreshPlayers();
