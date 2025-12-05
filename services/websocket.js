const { WebSocketServer } = require('ws'),
    { URL } = require('url');

let wss = null;

function initialize(server) {
    wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

        if (pathname === '/wsLog') {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        } else {
            socket.destroy();
        }
    });

    wss.on('connection', (ws) => {
        console.log('WebSocket client connected to /wsLog');

        ws.on('close', () => {
            console.log('WebSocket client disconnected from /wsLog');
        });
    });
}

function broadcast(data) {
    if (!wss) {
        return;
    }

    const message = JSON.stringify(data);

    wss.clients.forEach((client) => {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(message);
        }
    });
}

module.exports = {
    initialize,
    broadcast
};
