// Starts what the E2E tests need, the way simple-todo's suite does: a fresh local
// deContact relay (orbitdb-relay with deContact's access controller, src/relay.js),
// then a production build of the app pointed at that relay, served by vite preview.
// Playwright's webServer runs this and waits for the preview port.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const previewPort = process.env.E2E_PREVIEW_PORT || '4431';
const relayPorts = {
	http: process.env.E2E_RELAY_HTTP_PORT || '49300',
	tcp: process.env.E2E_RELAY_TCP_PORT || '49301',
	ws: process.env.E2E_RELAY_WS_PORT || '49302',
	webrtc: process.env.E2E_RELAY_WEBRTC_PORT || '49303'
};
// the topic Le Space's orbitdb-relays forward, as in production
const discoveryTopic = 'todo._peer-discovery._p2p._pubsub';
const relayDatastorePath = path.join(rootDir, 'test-results', 'e2e-relay-datastore');
const relayLogPath = path.join(rootDir, 'test-results', 'relay.log');

let relayProcess = null;
let previewProcess = null;
let stopping = false;

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
process.on('exit', () => {
	killChild(previewProcess);
	killChild(relayProcess);
});

rmSync(relayDatastorePath, { recursive: true, force: true });
mkdirSync(relayDatastorePath, { recursive: true });
writeFileSync(relayLogPath, '');

// cwd is the relay's own directory: OrbitDB keeps its identities under ./orbitdb
relayProcess = spawn('node', [path.join(rootDir, 'src', 'relay.js'), '--test'], {
	cwd: relayDatastorePath,
	env: {
		...process.env,
		NODE_ENV: 'development',
		RELAY_TCP_PORT: relayPorts.tcp,
		RELAY_WS_PORT: relayPorts.ws,
		RELAY_WEBRTC_PORT: relayPorts.webrtc,
		METRICS_PORT: relayPorts.http,
		DATASTORE_PATH: relayDatastorePath,
		PUBSUB_TOPICS: discoveryTopic,
		RELAY_LISTEN_IPV4: '127.0.0.1',
		RELAY_DISABLE_IPV6: 'true',
		RELAY_DISABLE_QUIC: 'true',
		RELAY_DISABLE_WEBRTC: 'true',
		RELAY_DISABLE_BOOTSTRAP: 'true',
		RELAY_DISABLE_DHT: 'true',
		RELAY_DISABLE_AUTONAT: 'true',
		disableAutoTLS: 'true',
		STRUCTURED_LOGS: 'false',
		ENABLE_SYNC_LOGS: 'true'
	},
	stdio: ['ignore', 'pipe', 'pipe']
});
for (const out of [relayProcess.stdout, relayProcess.stderr]) {
	out.on('data', (data) => writeFileSync(relayLogPath, data, { flag: 'a' }));
}
relayProcess.on('exit', (code, signal) => {
	if (!stopping) {
		console.error(`Relay exited (${signal ?? code}); see ${relayLogPath}`);
		stop(code ?? 1);
	}
});

const relayMultiaddr = await waitForRelayMultiaddr();
console.log(`E2E relay ready: ${relayMultiaddr}`);

const env = {
	...process.env,
	VITE_SEED_NODES: relayMultiaddr,
	VITE_SEED_NODES_DEV: relayMultiaddr,
	VITE_P2P_PUPSUB: discoveryTopic,
	VITE_P2P_PUPSUB_DEV: discoveryTopic,
	// only the local relay: the tests must not depend on Aleph or reach real relays
	VITE_ALEPH_RELAY_DISCOVERY: 'false'
};
await run('pnpm', ['exec', 'vite', 'build'], env);
previewProcess = spawn(
	'pnpm',
	['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', previewPort, '--strictPort'],
	{ cwd: rootDir, env, stdio: ['ignore', 'inherit', 'inherit'] }
);
previewProcess.on('exit', (code) => {
	if (!stopping) stop(code ?? 0);
});

async function waitForRelayMultiaddr() {
	const deadline = Date.now() + 60_000;
	let lastError;
	while (Date.now() < deadline) {
		try {
			const payload = await getJson(`http://127.0.0.1:${relayPorts.http}/multiaddrs`);
			const ws =
				payload?.byTransport?.websocket?.find((addr) => addr.includes('/ip4/127.0.0.1/')) ||
				payload?.best?.websocket;
			if (typeof ws === 'string' && ws.includes('/p2p/')) return ws;
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`relay did not report a WebSocket address: ${String(lastError)}`);
}

function getJson(url) {
	return new Promise((resolve, reject) => {
		http
			.get(url, (res) => {
				let body = '';
				res.setEncoding('utf8');
				res.on('data', (chunk) => (body += chunk));
				res.on('end', () => {
					if (res.statusCode !== 200) return reject(new Error(`${url}: ${res.statusCode}`));
					try {
						resolve(JSON.parse(body));
					} catch (error) {
						reject(error);
					}
				});
			})
			.on('error', reject);
	});
}

function run(command, args, runEnv) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd: rootDir, env: runEnv, stdio: ['ignore', 'inherit', 'inherit'] });
		child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')}: ${code}`))));
		child.on('error', reject);
	});
}

function stop(code) {
	if (stopping) return;
	stopping = true;
	killChild(previewProcess);
	killChild(relayProcess);
	setTimeout(() => process.exit(code), 250);
}

function killChild(child) {
	if (!child?.pid || child.killed) return;
	try {
		child.kill('SIGTERM');
	} catch {
		// already gone
	}
}
