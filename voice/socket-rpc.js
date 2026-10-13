export class SocketRpc {
  constructor(socket, { timeoutMs = 25000, onTimeout = () => {} } = {}) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.onTimeout = onTimeout;
    this.pending = new Map();
  }
  request(type, fields = {}) {
    if (this.socket.readyState !== 1) return Promise.reject(new Error('A hangkapcsolat megszakadt.'));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('A hangszolgáltatás nem válaszolt időben.'));
        // The provider may have committed a subscription whose reply was lost.
        // Close the whole session so backend cleanup owns every unknown resource.
        this.close();
        this.socket.close(4000, 'Signaling timeout');
        this.onTimeout();
      }, this.timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ type, requestId, ...fields })); }
      catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error); }
    });
  }
  reply(message) {
    const entry = this.pending.get(message.requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(message.requestId);
    if (message.ok === true) entry.resolve(message.result);
    else entry.reject(new Error(typeof message.error === 'string' ? message.error : 'Sikertelen hangművelet.'));
  }
  close() {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('A hangkapcsolat megszakadt.'));
    }
    this.pending.clear();
  }
}
