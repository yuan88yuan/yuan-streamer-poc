const WebSocket = require('ws');
const util = require('util');

// server_url = "ws://remote-streamer-control-poc.herokuapp.com/ws/";
// server_url = "ws://127.0.0.1:3000/ws/";
server_url = "ws://10.10.40.32:3000/ws/";
// server_url = "ws://yuan-streamer-poc.herokuapp.com/ws/";
const ws = new WebSocket(server_url);

ws.once('open', function open() {
	dev_info = {
		id: 'X3juNBgopcxCmMEpQiS943',
		serial: '0',
	};

	ws.send(JSON.stringify(dev_info));
});

ws.once('message', function on_got_id(data) {
	console.log(util.format("on_got_id: %s", data));

	let conn_info = JSON.parse(data);

	ws.on('message', function on_request(data) {
		console.log(util.format("on_request: %s", data));

		ws.send(util.format("streamer request data: %s", data));
	});
});