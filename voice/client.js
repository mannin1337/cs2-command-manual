import { API_BASE_URL } from './config.js';
import { VoiceAudio, audioDiagnostic } from './audio.js';
import { SocketRpc } from './socket-rpc.js';
import { Device } from './vendor/mediasoup-client.js';
import { MediasoupVoice } from './mediasoup-voice.js';
import { canHear, distanceMeters, fresh, validateFrame, STALE_MS } from './policy.js';

const ui = Object.fromEntries(['join-form','pair-code','microphone','join','leave','resume-audio','status','status-led','service-note','feedback','restore','self-state','players','players-empty','copy-command','diagnostic','diagnostic-results','diagnostic-details','diagnostic-values'].map(id => [id, document.getElementById(id)]));
let current = null;
let generation = 0;
let lastPlayersView = '';

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
ui.join.disabled = !socketUrl || !supported;

function status(text, state) {
  ui.status.textContent = text;
  ui['status-led'].dataset.state = state;
}
function alive(session) { return current === session && session.generation === generation; }
function active(session) { return alive(session) && session.media?.connected && session.socket?.readyState === WebSocket.OPEN && session.audio.context?.state === 'running'; }
function updateAudio(session) {
  const self = session.players.find(player => player.id === session.playerId);
  session.audio.update(self, session.players, session.receivedAt, performance.now(), active(session));
}

function renderPlayers(session) {
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
      if (alive(session)) void leave('A hangszolgáltatás nem válaszolt időben. A kapcsolat bontva; kérj új kódot a !voice paranccsal.', true);
    } });
    const timer = setTimeout(() => reject(new Error('A párosítás nem válaszolt időben. Kérj új kódot a !voice paranccsal.')), 8000);
    let joined = false;
    session.socket.onopen = () => {
      if (!alive(session)) return;
      session.socket.send(JSON.stringify({ type:'join', code:session.code }));
      session.code = '';
    };
    session.socket.onmessage = event => {
      if (!alive(session)) return;
      try {
        if (typeof event.data !== 'string' || new TextEncoder().encode(event.data).length > 65536) throw new Error('Hibás hangszolgáltatási üzenet.');
        const message = JSON.parse(event.data);
        if (message.type === 'reply') session.rpc.reply(message);
        else if (message.type === 'joined') {
          if (joined || typeof message.playerId !== 'string' || !message.routerRtpCapabilities || !Array.isArray(message.routerRtpCapabilities.codecs)) throw new Error('Hibás párosítási válasz.');
          joined = true;
          clearTimeout(timer);
          session.playerId = message.playerId;
          session.routerRtpCapabilities = message.routerRtpCapabilities;
          ui['pair-code'].value = '';
          resolve();
        } else if (message.type === 'frame' && joined) {
          if (!validateFrame(message)) throw new Error('Hibás játékállapot: a hangút lezárult.');
          if (session.epoch && session.epoch !== message.epoch) throw new Error('A játékszerver újraindult. Kérj új párosítókódot.');
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
          }, STALE_MS);
          updateAudio(session);
          reconcile(session);
          renderPlayers(session);
          if (active(session)) status('Kapcsolódva · játékállapot élő', 'connected');
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
      if (alive(session)) void leave('A hangkapcsolat megszakadt. Kérj új kódot a játékban.', true);
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
  if (current || !socketUrl || !supported) return;
  const code = ui['pair-code'].value.trim();
  if (!code) { ui['pair-code'].focus(); return; }
  const session = { generation:++generation, audio:new VoiceAudio({ onDecoderFailure:() => {
    if (alive(session)) void leave('A böngésző nem tudta elindítani a térhang vételét. A kapcsolat bontva; kérj új !voice kódot.', true);
  } }), code, players:[], playerId:null, receivedAt:-Infinity, seq:-1, epoch:null, receivers:new Map(), retryAfter:new Map(), abort:new AbortController() };
  current = session;
  ui.join.disabled = true;
  ui['pair-code'].disabled = true;
  ui.microphone.disabled = true;
  ui.leave.disabled = false;
  ui.restore.hidden = true;
  ui.feedback.textContent = 'Engedélyezd a mikrofont a böngésző kérdésénél.';
  status('Mikrofon és párosítás indítása…', 'busy');
  try {
    // Both start in the same click gesture. Every subsequent await checks session identity.
    const capture = session.audio.start(ui.microphone.value);
    const [track] = await Promise.all([capture, openSocket(session)]);
    if (!alive(session)) return;
    session.audio.capture.getTracks().forEach(rawTrack => rawTrack.addEventListener('ended', () => { if (alive(session)) void leave('A mikrofon hozzáférése megszűnt.', true); }, { once:true }));
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
        status(active(session) && fresh(performance.now(), session.receivedAt) ? 'Kapcsolódva · játékállapot élő' : 'Párosítva · hangkapcsolatra vár', active(session) && fresh(performance.now(), session.receivedAt) ? 'connected' : 'busy');
      }
    });
    session.receivers = session.media.receivers;
    session.audio.context.onstatechange = () => {
      if (!alive(session)) return;
      ui['resume-audio'].hidden = session.audio.context.state === 'running';
      if (session.audio.context.state !== 'running') { session.audio.silence(); status('A böngésző felfüggesztette a hangot', 'busy'); }
      else updateAudio(session);
    };
    await session.media.start(session.routerRtpCapabilities, track);
    if (!alive(session)) return;
    updateAudio(session);
    reconcile(session);
    renderPlayers(session);
    status(active(session) && fresh(performance.now(), session.receivedAt) ? 'Kapcsolódva · játékállapot élő' : 'Párosítva · hangkapcsolatra vár', active(session) && fresh(performance.now(), session.receivedAt) ? 'connected' : 'busy');
    ui.feedback.textContent = 'Térj vissza a CS2-be, és használd a megszokott beszédgombot. A lap maradjon nyitva.';
  } catch (error) {
    if (alive(session)) {
      const message = error.name === 'NotAllowedError' ? 'A mikrofon engedélye hiányzik. Engedélyezd a böngésző oldalbeállításaiban, és kérj új kódot.' : error.name === 'NotFoundError' ? 'Nem található mikrofon. Csatlakoztass egyet, és kérj új kódot.' : error.message;
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
    session.abort.abort();
    for (const id of [...session.receivers.keys()]) closeReceiver(session, id);
    session.media?.close();
    if (session.socket?.readyState === WebSocket.OPEN) session.socket.send(JSON.stringify({ type:'leave' }));
    session.rpc?.close();
    session.socket?.close();
    void session.audio.close().catch(() => {});
  }
  ui.join.disabled = !socketUrl || !supported;
  ui['pair-code'].disabled = false;
  ui.microphone.disabled = false;
  ui.leave.disabled = true;
  ui['resume-audio'].hidden = true;
  ui.restore.hidden = !session;
  ui.feedback.textContent = message;
  status(error ? 'Nincs kapcsolat · hang lezárva' : 'Nincs kapcsolat', error ? 'error' : 'idle');
  renderPlayers(null);
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
