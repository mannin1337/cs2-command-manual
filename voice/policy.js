export const RANGE_METERS = 20;
export const STALE_MS = 750;
export const MAX_PLAYERS = 32;
const finiteVector = v => Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 1e7);
export function distanceMeters(a,b) {
  if(!finiteVector(a) || !finiteVector(b)) return Infinity;
  return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]) * .0254;
}
export function canHear(receiver,sender,range=RANGE_METERS) {
  return Boolean(receiver && sender && receiver.id !== sender.id && receiver.alive && sender.alive && !sender.muted && distanceMeters(receiver.pos,sender.pos) < range);
}
export const sourceToAudio = ([x,y,z]) => [x*.0254,z*.0254,-y*.0254];
export function cameraVectors(pitch,yaw) {
  const p=pitch*Math.PI/180, y=yaw*Math.PI/180, cp=Math.cos(p), sp=Math.sin(p), cy=Math.cos(y), sy=Math.sin(y);
  return {forward:[cp*cy,-sp,-cp*sy],up:[sp*cy,cp,-sp*sy]};
}
export function validateFrame(frame) {
  return Boolean(frame?.type==='frame' && typeof frame.epoch==='string' && frame.epoch.length<=64 && Number.isSafeInteger(frame.seq) && frame.seq>=0
    && Array.isArray(frame.players) && frame.players.length<=MAX_PLAYERS && new Set(frame.players.map(p=>p?.id)).size===frame.players.length
    && frame.players.every(p=>p && typeof p.id==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(p.id) && typeof p.name==='string' && p.name.length<=100
      && typeof p.alive==='boolean' && typeof p.muted==='boolean' && typeof p.speaking==='boolean' && finiteVector(p.pos)
      && Number.isFinite(p.pitch) && Math.abs(p.pitch)<=360 && Number.isFinite(p.yaw) && Math.abs(p.yaw)<=36000));
}
export function fresh(now,updated) { return Number.isFinite(updated) && now>=updated && now-updated<STALE_MS; }
export function validAudioSdp(sdp) {
  return typeof sdp==='string' && sdp.length<=64000 && /^v=0\r?\n/.test(sdp) && /^m=audio /m.test(sdp) && !/^m=(video|application) /m.test(sdp);
}
