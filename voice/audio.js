import { canHear, sourceToAudio, cameraVectors, fresh, STALE_MS } from './policy.js';

const SMOOTH_SECONDS = .025;
function setParam(param, value, context, smooth = true) {
  param.cancelScheduledValues(context.currentTime);
  if (smooth) param.setTargetAtTime(value, context.currentTime, SMOOTH_SECONDS);
  else param.setValueAtTime(value, context.currentTime);
}
function gate(param, open, context, cutoff) {
  setParam(param, open ? 1 : 0, context, open);
  // Audio-thread automation still runs when the background tab's JS is throttled.
  if (open) param.setValueAtTime(0, cutoff);
}
function position(node, values, context) {
  ['X','Y','Z'].forEach((axis, i) => setParam(node[`position${axis}`], values[i], context));
}
function orient(listener, pitch, yaw, context) {
  const { forward, up } = cameraVectors(pitch, yaw);
  ['X','Y','Z'].forEach((axis, i) => {
    setParam(listener[`forward${axis}`], forward[i], context);
    setParam(listener[`up${axis}`], up[i], context);
  });
}
function panner(context) {
  const node = context.createPanner();
  node.panningModel = 'HRTF';
  node.distanceModel = 'linear';
  node.refDistance = 1;
  node.maxDistance = 20;
  node.rolloffFactor = 1;
  return node;
}

// Chromium needs remote media playout active before Web Audio receives decoded PCM.
// This element only drives decoding; its output is permanently muted twice.
export function activateRemoteDecoder(stream, { createElement = () => document.createElement('audio'), attach = element => document.body.append(element) } = {}) {
  const element = createElement();
  let closed = false;
  const close = () => { closed = true; element.pause(); element.srcObject = null; element.remove(); };
  element.muted = true;
  element.defaultMuted = true;
  element.volume = 0;
  element.hidden = true;
  element.setAttribute('playsinline', '');
  element.srcObject = stream;
  try {
    attach(element);
    const ready = Promise.resolve(element.play()).then(() => { if (closed) close(); }, error => { close(); throw error; });
    return { element, ready, close };
  } catch (error) { close(); throw error; }
}

export class VoiceAudio {
  constructor({ createContext = () => new AudioContext(), getUserMedia = constraints => navigator.mediaDevices.getUserMedia(constraints), createAudioElement = () => document.createElement('audio'), attachAudioElement = element => document.body.append(element), onDecoderFailure = () => {} } = {}) {
    this.createContext = createContext;
    this.getUserMedia = getUserMedia;
    this.createAudioElement = createAudioElement;
    this.attachAudioElement = attachAudioElement;
    this.onDecoderFailure = onDecoderFailure;
    this.decoderFailure = null;
    this.context = null;
    this.capture = null;
    this.input = null;
    this.peers = new Map();
    this.generation = 0;
  }
  async start(deviceId = '') {
    const generation = ++this.generation;
    const context = this.context = this.createContext();
    this.input = context.createGain();
    this.input.gain.value = 0;
    this.outgoing = context.createMediaStreamDestination();
    this.input.connect(this.outgoing);
    // Begin resume in the button gesture, before the permission promise yields.
    const resumed = context.resume();
    resumed.catch(() => {}); // Permission may remain pending longer than context resume.
    const capture = await this.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:false, ...(deviceId ? { deviceId:{ exact:deviceId } } : {}) }, video:false });
    if (generation !== this.generation) {
      capture.getTracks().forEach(track => track.stop());
      throw new Error('A mikrofon indítása megszakadt.');
    }
    this.capture = capture;
    this.source = context.createMediaStreamSource(capture);
    this.source.connect(this.input);
    await resumed;
    if (generation !== this.generation) throw new Error('A mikrofon indítása megszakadt.');
    return this.outgoing.stream.getAudioTracks()[0];
  }
  addPeer(id, stream) {
    if (!this.context || this.decoderFailure || this.peers.has(id)) return;
    const context = this.context;
    const generation = this.generation;
    const source = this.context.createMediaStreamSource(stream);
    const gain = this.context.createGain();
    gain.gain.value = 0;
    const spatial = panner(this.context);
    source.connect(gain);
    gain.connect(spatial);
    spatial.connect(this.context.destination);
    const graph = { source, gain, panner:spatial, decoder:null, decoderReady:false };
    this.peers.set(id, graph);
    const current = () => this.peers.get(id) === graph && this.context === context && this.generation === generation;
    const failed = error => {
      if (!current()) return;
      this.decoderFailure = error;
      this.removePeer(id);
      this.silence();
      this.onDecoderFailure(id, error);
    };
    try {
      const decoder = graph.decoder = activateRemoteDecoder(stream, { createElement:this.createAudioElement, attach:this.attachAudioElement });
      decoder.ready.then(() => {
        if (!current()) { decoder.close(); return; }
        graph.decoderReady = true;
      }).catch(failed);
    } catch (error) { failed(error); }
  }
  removePeer(id) {
    const graph = this.peers.get(id);
    if (!graph) return;
    setParam(graph.gain.gain, 0, this.context, false);
    graph.decoder?.close();
    graph.source.disconnect();
    graph.gain.disconnect();
    graph.panner.disconnect();
    this.peers.delete(id);
  }
  update(self, players, receivedAt, now, connected) {
    if (!this.context || !this.input) return;
    const valid = !this.decoderFailure && connected && fresh(now, receivedAt) && Boolean(self?.alive);
    const transmit = valid && !self.muted && self.speaking;
    const cutoff = this.context.currentTime + Math.max(0, STALE_MS - (now - receivedAt)) / 1000;
    // Revocation is immediate. Only opening/position changes use 25 ms smoothing.
    // Reapply after every cancellation, including voice events, at the frame's deadline.
    gate(this.input.gain, transmit, this.context, cutoff);
    if (valid) {
      position(this.context.listener, sourceToAudio(self.pos), this.context);
      orient(this.context.listener, self.pitch, self.yaw, this.context);
    }
    const byId = new Map(players.map(player => [player.id, player]));
    for (const [id, graph] of this.peers) {
      const peer = byId.get(id);
      const audible = valid && graph.decoderReady && canHear(self, peer) && peer.speaking === true;
      gate(graph.gain.gain, audible, this.context, cutoff);
      if (audible) position(graph.panner, sourceToAudio(peer.pos), this.context);
    }
  }
  silence() {
    if (!this.context) return;
    if (this.input) setParam(this.input.gain, 0, this.context, false);
    for (const graph of this.peers.values()) setParam(graph.gain.gain, 0, this.context, false);
  }
  async close() {
    ++this.generation;
    this.silence();
    for (const id of [...this.peers.keys()]) this.removePeer(id);
    this.capture?.getTracks().forEach(track => track.stop());
    this.outgoing?.stream.getTracks().forEach(track => track.stop());
    this.source?.disconnect();
    this.input?.disconnect();
    this.capture = null;
    this.input = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') await context.close();
  }
}

// Uses synthetic noise offline: no microphone, socket, recording or speaker playback.
export async function audioDiagnostic() {
  async function render(x, z, yaw = 90) {
    const context = new OfflineAudioContext(2, 24000, 48000);
    const source = context.createBufferSource();
    const buffer = context.createBuffer(1, 24000, 48000);
    const data = buffer.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      data[i] = (seed / 2147483648) * .2;
    }
    source.buffer = buffer;
    const spatial = panner(context);
    spatial.positionX.value = x;
    spatial.positionZ.value = z;
    const vectors = cameraVectors(0, yaw);
    ['X','Y','Z'].forEach((axis, i) => {
      context.listener[`forward${axis}`].value = vectors.forward[i];
      context.listener[`up${axis}`].value = vectors.up[i];
    });
    source.connect(spatial);
    spatial.connect(context.destination);
    source.start();
    const result = await context.startRendering();
    const rms = channel => {
      const samples = result.getChannelData(channel);
      let sum = 0;
      for (let i = 4800; i < samples.length; i++) sum += samples[i] ** 2;
      return Math.sqrt(sum / (samples.length - 4800));
    };
    return { left:rms(0), right:rms(1) };
  }
  const left = await render(-3, -4);
  const right = await render(3, -4);
  const turned = await render(3, -4, 270);
  const distances = [];
  for (const meters of [5,15,20]) distances.push(await render(0, -meters));
  const energy = sample => Math.hypot(sample.left, sample.right);
  const cutoffContext = new OfflineAudioContext(1, 48000, 48000);
  const oscillator = cutoffContext.createOscillator();
  const inputGate = cutoffContext.createGain();
  const outputGate = cutoffContext.createGain();
  inputGate.gain.value = outputGate.gain.value = 0;
  oscillator.connect(inputGate);
  inputGate.connect(outputGate);
  outputGate.connect(cutoffContext.destination);
  gate(inputGate.gain, true, cutoffContext, STALE_MS / 1000);
  gate(outputGate.gain, true, cutoffContext, STALE_MS / 1000);
  oscillator.start();
  const cutoffAudio = (await cutoffContext.startRendering()).getChannelData(0);
  const segmentRms = (start, end) => Math.sqrt(cutoffAudio.slice(start, end).reduce((sum, value) => sum + value ** 2, 0) / (end - start));
  const cutoff = { before:segmentRms(28800,33600), after:segmentRms(38400,43200) };
  return {
    checks:[
      { name:'Bal oldali hang → bal csatorna', ok:left.left > left.right * 1.05 },
      { name:'Jobb oldali hang → jobb csatorna', ok:right.right > right.left * 1.05 },
      { name:'180° fordulás → oldalcsere', ok:turned.left > turned.right * 1.05 },
      { name:'5 m → 15 m: távolsági halkulás', ok:energy(distances[0]) > energy(distances[1]) * 2 },
      { name:'20 méternél teljes csend', ok:energy(distances[2]) < 1e-7 },
      { name:'750 ms után csend, JavaScript időzítő nélkül', ok:cutoff.before > .001 && cutoff.after < 1e-7 },
    ],
    samples:{ left, right, turned, distance5:distances[0], distance15:distances[1], distance20:distances[2], cutoff },
  };
}
