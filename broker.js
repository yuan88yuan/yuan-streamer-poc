const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const util = require('util');
const HashMap = require('hashmap');
const PORT = process.env.PORT || 3000

// const { v4: uuid } = require('uuid');

const { default: ShortUniqueId } = require('short-unique-id');
const uuid = new ShortUniqueId();

const server = http.createServer();
const wss = new WebSocket.Server({ noServer: true });
const connMap = new HashMap();		// conn-id ==> conn_info
const wsMap = new HashMap();		// ws ==> conn-id
const devMap = new HashMap();		// dev-id@serial ==> conn_info

function noop() {}

function heartbeat() {
	this.isAlive = true;
}

function dev_uuid2(id, serial) {
	return util.format("%s&%s", id, serial)
}

function dev_uuid(dev_info) {
	return dev_uuid2(dev_info.id, dev_info.serial);
}

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();

    ws.isAlive = false;
    ws.ping(noop);
  });
}, 30000);

wss.on('connection', function connection(ws) {
	ws.isAlive = true;
	ws.on('pong', heartbeat);

	ws.once("message", function on_conn_info(data) {
		console.log(util.format("on_conn_info: %s", data));

		let dev_info = JSON.parse(data);

		ws.once('close', function on_close(code, reason) {
			let id = wsMap.get(ws);
			let conn_info = connMap.get(id).conn_info;
			console.log(util.format("id(%s@%s) removed", conn_info.conn_id, dev_uuid(conn_info.dev_info)));

			wsMap.delete(ws);
			connMap.delete(id);
			devMap.delete(dev_uuid(conn_info.dev_info));
		});

		let conn_info = {conn_id: uuid(), dev_info: dev_info};
		console.log(util.format("id(%s@%s) added", conn_info.conn_id, dev_uuid(conn_info.dev_info)));

		let dev_conn_info = {conn_info: conn_info, ws: ws};

		connMap.set(conn_info.conn_id, dev_conn_info);
		wsMap.set(ws, conn_info.id);
		devMap.set(dev_uuid(conn_info.dev_info), dev_conn_info);

		ws.send(JSON.stringify(conn_info));
	});
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
			wss.handleUpgrade(request, socket, head, function done(ws) {
				wss.emit('connection', ws, request);
			});
		} else {
			socket.destroy();
		}
	} else {
		socket.destroy();
	}
});

function route_request(request, response, ws) {
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

		ws.once('close', on_close);

		ws.send(body);
		ws.once("message", function on_message(data) {
			console.log(util.format("on_message: %s", data));

			ws.removeListener('close', on_close);

			response.writeHead(200, {'Content-Type': 'application/json'});
			response.write(data);
			response.end();
		});
	});
}

server.on("request", function request(request, response) {
	const pathname = url.parse(request.url).pathname;
	const elems = pathname.split('/');

	let ret = null;
	if(elems.length > 1) {
		const cmd = elems[1];

		if(cmd == "_list") {
			let services = [];
			connMap.forEach(function(value, key) {
				let conn_info = value.conn_info;

				services.push({conn_id: conn_info.conn_id, dev_info: conn_info.dev_info});
			});

			ret = {err: 'ok', services: services};
		} else if(cmd == "_dev") {
			if(elems.length > 3) {
				const dev_id = elems[2];
				const dev_serial = elems[3];
				const dev_conn_info = devMap.get(dev_uuid2(dev_id, dev_serial));

				if(dev_conn_info == null) {
					ret = {err: 'unexpected'};
				} else {
					ret = {err: 'ok', dev_conn_info: dev_conn_info.conn_info};
				}
			} else {
				ret = {err: 'unexpected'};
			}
		} else if(cmd == '_req') {
			if(elems.length > 2) {
				const conn_id = elems[2];
				const dev_conn_info = connMap.get(conn_id);

				if(dev_conn_info == null) {
					ret = {err: 'unexpected'};
				} else {
					route_request(request, response, dev_conn_info.ws);
				}
			} else {
				ret = {err: 'unexpected'};
			}
		} else if(cmd == "_") {
			if(elems.length > 3) {
				const dev_id = elems[2];
				const dev_serial = elems[3];
				const dev_conn_info = devMap.get(dev_uuid2(dev_id, dev_serial));

				if(dev_conn_info == null) {
					ret = {err: 'unexpected'};
				} else {
					route_request(request, response, dev_conn_info.ws);
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
