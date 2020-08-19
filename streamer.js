const WebSocket = require('ws');
const util = require('util');

// server_url = "ws://remote-streamer-control-poc.herokuapp.com/ws/";
// server_url = "ws://127.0.0.1:8080/ws/";
server_url = "ws://yuan-streamer-poc.herokuapp.com/ws/";
const ws = new WebSocket(server_url);
let client_id = 0;

ws.once('open', function open() {
	group_info = {
		id: '5ffc1d04',
		name: 'zzlab.demo',
	};

	ws.send(JSON.stringify(group_info));
});

ws.once('message', function on_got_id(data) {
	console.log(util.format("on_got_id: %s", data));

	let ret = JSON.parse(data);
	client_id = ret.id;

	ws.on('message', function on_request(data) {
		console.log(util.format("on_request: %s", data));

		ws.send(util.format("streamer request data: %s", data));
	});
});