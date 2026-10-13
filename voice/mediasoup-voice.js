// Signaling glue for the official SDK; microphone and spatial policy stay in VoiceAudio.
export class MediasoupVoice {
  constructor({ Device, rpc, audio, signal, isLive, onChange = () => {}, onFailure, makeStream = track => new MediaStream([track]) }) {
    this.Device = Device;
    this.rpc = rpc;
    this.audio = audio;
    this.signal = signal;
    this.isLive = isLive;
    this.onChange = onChange;
    this.onFailure = onFailure;
    this.makeStream = makeStream;
    this.closed = false;
    this.receivers = new Map();
    this.aborted = () => this.close();
    signal.addEventListener('abort', this.aborted, { once:true });
  }
  live() { return !this.closed && !this.signal.aborted && this.isLive(); }
  assertLive() { if (!this.live()) throw new Error('A hangkapcsolat indítása megszakadt.'); }
  get connected() { return this.live() && Boolean(this.producer && !this.producer.closed && this.send?.connectionState === 'connected'); }
  fail(error) {
    if (!this.live()) return;
    this.close();
    this.onFailure(error);
  }
  wire(transport) {
    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      if (!this.live()) { errback(new Error('A hangkapcsolat megszakadt.')); return; }
      this.rpc.request('connect_transport', { transportId:transport.id, dtlsParameters }).then(() => {
        this.assertLive();
        callback();
      }).catch(errback);
    });
    transport.on('connectionstatechange', state => {
      if (!this.live()) return;
      if (['failed','disconnected','closed'].includes(state)) {
        this.fail(new Error('A közös hangkapcsolat megszakadt. Kérj új !voice kódot.'));
        return;
      }
      this.refreshReceivers();
      this.onChange();
    });
  }
  async start(routerRtpCapabilities, track) {
    this.assertLive();
    this.device = await this.Device.factory();
    this.assertLive();
    await this.device.load({ routerRtpCapabilities });
    this.assertLive();
    if (!this.device.canProduce('audio') || track.kind !== 'audio') throw new Error('Ez a böngésző nem támogatja a hangküldést.');
    const sendOptions = await this.rpc.request('create_transport', { direction:'send' });
    this.assertLive();
    this.send = this.device.createSendTransport(sendOptions);
    this.wire(this.send);
    this.send.on('produce', ({ kind, rtpParameters }, callback, errback) => {
      if (!this.live() || kind !== 'audio') { errback(new Error('Csak élő hangkapcsolat használható.')); return; }
      this.rpc.request('produce', { transportId:this.send.id, kind, rtpParameters }).then(result => {
        this.assertLive();
        if (typeof result?.id !== 'string') throw new Error('Hibás hangküldő válasz.');
        callback({ id:result.id });
      }).catch(errback);
    });
    const recvOptions = await this.rpc.request('create_transport', { direction:'recv' });
    this.assertLive();
    this.recv = this.device.createRecvTransport(recvOptions);
    this.wire(this.recv);
    const producer = await this.send.produce({ track, stopTracks:false });
    if (!this.live()) { producer.close(); throw new Error('A hangkapcsolat indítása megszakadt.'); }
    this.producer = producer;
    producer.on('transportclose', () => this.fail(new Error('A hangküldő kapcsolat megszakadt.')));
    producer.on('trackended', () => this.fail(new Error('A mikrofon hangútja megszűnt.')));
    this.onChange();
  }
  refreshReceivers() {
    for (const [peerId, entry] of this.receivers) {
      entry.ready = entry.resumed && this.recv?.connectionState === 'connected';
      if (entry.ready && entry.consumer) this.audio.addPeer(peerId, this.makeStream(entry.consumer.track));
      else this.audio.removePeer(peerId);
    }
  }
  closeRemote(consumerId) {
    return this.rpc.request('close_consumer', { consumerId }).catch(error => {
      // Closed sockets trigger backend session cleanup; live cleanup failures fail closed.
      if (this.live()) this.fail(error);
    });
  }
  remove(peerId) {
    const entry = this.receivers.get(peerId);
    if (!entry) return;
    entry.cancelled = true;
    this.receivers.delete(peerId);
    this.audio.removePeer(peerId);
    entry.consumer?.close();
    if (entry.id) void this.closeRemote(entry.id);
  }
  async consume(peerId) {
    this.assertLive();
    if (!this.recv || this.receivers.has(peerId)) return;
    const entry = { id:null, consumer:null, resumed:false, ready:false, cancelled:false };
    this.receivers.set(peerId, entry);
    const live = () => this.live() && !entry.cancelled && this.receivers.get(peerId) === entry;
    try {
      const result = await this.rpc.request('consume', { transportId:this.recv.id, peerId, rtpCapabilities:this.device.recvRtpCapabilities });
      entry.id = result?.id;
      if (!live()) { if (entry.id) await this.closeRemote(entry.id); return; }
      if (typeof result?.id !== 'string' || typeof result.producerId !== 'string' || result.peerId !== peerId || result.kind !== 'audio' || !result.rtpParameters || typeof result.rtpParameters !== 'object') throw new Error('Hibás hangvételi válasz.');
      const consumer = await this.recv.consume({ id:result.id, producerId:result.producerId, kind:'audio', rtpParameters:result.rtpParameters });
      entry.consumer = consumer;
      if (!live()) { consumer.close(); await this.closeRemote(entry.id); return; }
      consumer.on('transportclose', () => this.fail(new Error('A közös hangvételi kapcsolat megszakadt.')));
      consumer.on('trackended', () => {
        if (live()) { this.remove(peerId); this.onChange(); }
      });
      await this.rpc.request('resume_consumer', { consumerId:entry.id });
      if (!live()) { consumer.close(); await this.closeRemote(entry.id); return; }
      entry.resumed = true;
      this.refreshReceivers();
      this.onChange();
    } catch (error) {
      if (!live()) { entry.consumer?.close(); if (entry.id) await this.closeRemote(entry.id); return; }
      this.remove(peerId);
      throw error;
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.signal.removeEventListener('abort', this.aborted);
    this.audio.silence();
    for (const id of [...this.receivers.keys()]) this.remove(id);
    this.producer?.close();
    this.send?.close();
    this.recv?.close();
  }
}
