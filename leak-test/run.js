// Leak repro orchestrator.
//   node run.js stalled   -> subscriber never reads its socket (the leak)
//   node run.js healthy   -> subscriber drains normally (control: should stay flat)
//   node run.js none      -> publisher only, no subscriber (control)
const net = require('net');
const fs = require('fs');
const { spawn } = require('child_process');
const { encodeAmf0Cmd } = require('node-media-server/dist/node_core_amf');

const MODE = process.argv[2] || 'stalled';
const RTMP_PORT = 19350;
const HTTP_PORT = 18200;
const FRAME = Buffer.alloc(200 * 1024); // 200 KB "video" payload
FRAME[0] = 0x17; // keyframe + AVC
FRAME[1] = 0x01; // NALU (codec sees keyframe -> gop cache stays ~1 frame, so growth is purely the subscriber buffer)
FRAME.writeUIntBE(0, 2, 3); // composition time
// AVC sequence header (so the subscriber's onPlay completes cleanly and it joins httpPlayers)
const AVC_SEQ = Buffer.from([
  0x17, 0x00, 0x00, 0x00, 0x00, 0x01, 0x42, 0x00, 0x1e, 0xff,
  0xe1, 0x00, 0x04, 0x67, 0x42, 0x00, 0x1e, 0x01, 0x00, 0x04, 0x68, 0xce, 0x3c, 0x80,
]);
const FRAME_INTERVAL_MS = 2; // push hard
const SEND_CAP_BYTES = 800 * 1024 * 1024; // stop after ~800 MB pushed
const RUN_MS = 18000;

// --- RTMP framing (single fmt-0 chunk; server chunkSize raised first) ---
function chunk0(csid, msgTypeId, msgStreamId, timestamp, body) {
  const basic = Buffer.from([(0 << 6) | csid]);
  const h = Buffer.alloc(11);
  h.writeUIntBE(timestamp & 0xffffff, 0, 3);
  h.writeUIntBE(body.length, 3, 3);
  h.writeUInt8(msgTypeId, 6);
  h.writeUInt32LE(msgStreamId, 7);
  return Buffer.concat([basic, h, body]);
}
function setChunkSize(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return chunk0(2, 1, 0, 0, b);
}

let publisherBytes = 0;
function startPublisher() {
  const sock = net.connect(RTMP_PORT, '127.0.0.1');
  let handshakeDone = false;
  let inbuf = Buffer.alloc(0);
  let ts = 0;
  let mediaTimer = null;

  sock.on('connect', () => {
    // C0 + C1 (all zero -> server uses simple handshake, echoes back)
    sock.write(Buffer.concat([Buffer.from([0x03]), Buffer.alloc(1536)]));
  });

  sock.on('data', (d) => {
    if (handshakeDone) return; // drain & ignore server responses
    inbuf = Buffer.concat([inbuf, d]);
    if (inbuf.length >= 3073) {
      handshakeDone = true;
      sock.write(Buffer.alloc(1536)); // C2 (server ignores content)
      sock.write(setChunkSize(4194304));
      sock.write(chunk0(3, 20, 0, 0, encodeAmf0Cmd({
        cmd: 'connect', transId: 1,
        cmdObj: { app: 'live', flashVer: 'FMLE/3.0', tcUrl: 'rtmp://127.0.0.1/live' },
      })));
      setTimeout(() => sock.write(chunk0(3, 20, 0, 0,
        encodeAmf0Cmd({ cmd: 'createStream', transId: 2, cmdObj: null }))), 150);
      setTimeout(() => sock.write(chunk0(3, 20, 1, 0,
        encodeAmf0Cmd({ cmd: 'publish', transId: 3, cmdObj: null, streamName: 'test', type: 'live' }))), 300);
      setTimeout(() => {
        console.log('[publisher] streaming...');
        sock.write(chunk0(6, 9, 1, 0, AVC_SEQ)); // sequence header first
        mediaTimer = setInterval(() => {
          if (publisherBytes >= SEND_CAP_BYTES) { clearInterval(mediaTimer); return; }
          ts += 33;
          const msg = chunk0(6, 9, 1, ts, FRAME);
          sock.write(msg);
          publisherBytes += msg.length;
        }, FRAME_INTERVAL_MS);
      }, 600);
    }
  });
  sock.on('error', (e) => console.log('[publisher] err', e.message));
  return sock;
}

function startSubscriber(mode) {
  const sock = net.connect(HTTP_PORT, '127.0.0.1', () => {
    sock.write('GET /live/test.flv HTTP/1.1\r\nHost: localhost\r\nConnection: keep-alive\r\n\r\n');
    if (mode === 'stalled') {
      sock.pause(); // never consume -> server-side write buffer grows unbounded
    } else if (mode === 'healthy') {
      sock.on('data', () => {}); // drain everything
    }
  });
  sock.on('error', () => {});
  return sock;
}

// --- measure the SERVER child's resident memory ---
function rssMB(pid) {
  try {
    const m = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)\s+kB/);
    return m ? parseInt(m[1], 10) / 1024 : null;
  } catch { return null; }
}

const log = fs.openSync(`${__dirname}/server.log`, 'w');
const child = spawn('node', [`${__dirname}/server.js`], { stdio: ['ignore', log, log] });

const t0 = Date.now();
let baseline = null;
let peak = 0;
const samples = [];

const monitor = setInterval(() => {
  const r = rssMB(child.pid);
  if (r == null) return;
  if (baseline == null) baseline = r;
  peak = Math.max(peak, r);
  const el = ((Date.now() - t0) / 1000).toFixed(1);
  samples.push([el, r]);
  console.log(
    `t=${el}s  rss=${r.toFixed(0)}MB  Δ=${(r - baseline).toFixed(0)}MB  pushed=${(publisherBytes / 1048576).toFixed(0)}MB`,
  );
}, 500);

setTimeout(() => {
  console.log(`\n=== MODE=${MODE} ===`);
  startPublisher();
  setTimeout(() => {
    if (MODE !== 'none') {
      console.log(`[subscriber] connecting (${MODE})`);
      startSubscriber(MODE);
    }
  }, 1500);
}, 1500);

setTimeout(() => {
  clearInterval(monitor);
  console.log(`\nRESULT mode=${MODE}: baseline=${baseline?.toFixed(0)}MB peak=${peak.toFixed(0)}MB growth=${(peak - baseline).toFixed(0)}MB pushed=${(publisherBytes / 1048576).toFixed(0)}MB`);
  child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 300);
}, RUN_MS);
