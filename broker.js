const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const util = require('util');
const HashMap = require('hashmap');
const PORT = process.env.PORT || 5000

// const { v4: uuid } = require('uuid');

const { default: ShortUniqueId } = require('short-unique-id');
const uuid = new ShortUniqueId();

const server = http.createServer();
const wss1 = new WebSocket.Server({ noServer: true });
const clientMap = new HashMap();
const wsMap = new HashMap();

function noop() {}

function heartbeat() {
	this.isAlive = true;
}

const interval = setInterval(function ping() {
  wss1.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();

    ws.isAlive = false;
    ws.ping(noop);
  });
}, 5000);

wss1.on('connection', function connection(ws) {
	ws.isAlive = true;
	ws.on('pong', heartbeat);

	ws.once('close', function close(code, reason) {
		let id = wsMap.get(ws);
		console.log(util.format("id(%s) removed", id));

		wsMap.delete(ws);
		clientMap.delete(id);
	});

	let client_info = {id: uuid()}
	console.log(util.format("id(%s) added", client_info.id));

	clientMap.set(client_info.id, {data: client_info, ws: ws});
	wsMap.set(ws, client_info.id);

	ws.send(JSON.stringify(client_info));
});

wss.on('close', function close() {
	clearInterval(interval);
});

server.on('upgrade', function upgrade(request, socket, head) {
	const pathname = url.parse(request.url).pathname;
	const elems = pathname.split('/');

	if(elems.length > 1) {
		const cmd = elems[1];

		if (cmd == 'ws') {
			wss1.handleUpgrade(request, socket, head, function done(ws) {
				wss1.emit('connection', ws, request);
			});
		} else {
			socket.destroy();
		}
	} else {
		socket.destroy();
	}
});

server.on("request", function request(request, response) {
	const pathname = url.parse(request.url).pathname;
	const elems = pathname.split('/');

	let ret = null;
	if(elems.length > 1) {
		const cmd = elems[1];

		if(cmd == "list") {
			ret = {err: 'ok', list: clientMap.keys()};
		} else if(cmd == 'req') {
			if(elems.length > 2) {
				const client_id = elems[2];
				const client_info = clientMap.get(client_id);

				if(client_info == null) {
					ret = {err: 'unexpected'};
				} else {
					let body = [];
					request.on('data', (chunk) => {
						body.push(chunk);
					}).on('end', () => {
						body = Buffer.concat(body).toString();
						console.log(util.format("body: %s", body));

						function on_close(code, reason) {
							console.log(util.format("client closed %d, %s", code, reason));

							ret = {err: {code: code, reason: reason}};

							response.writeHead(200, {'Content-Type': 'application/json'});
							response.write(JSON.stringify(ret));
							response.end();
						}

						client_info.ws.once('close', on_close);

						client_info.ws.send(body);
						client_info.ws.once("message", function on_message(data) {
							console.log(util.format("on_message: %s", data));

							client_info.ws.removeListener('close', on_close);

							response.writeHead(200, {'Content-Type': 'application/json'});
							response.write(data);
							response.end();
						});
					});
				}
			} else {
				ret = {err: 'unexpected'};
			}
		} else {
			ret = {err: 'unexpected'};
		}
	} else {
		ret = {err: 'unexpected'};
	}

	if(ret != null) {
		response.writeHead(200, {'Content-Type': 'application/json'});
		response.write(JSON.stringify(ret));
		response.end();
	}
});

console.log(util.format("Broker started @ %d", PORT));
server.listen(PORT);
