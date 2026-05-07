const const { WebSocketServer } = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });

let nextId = 1;
const players = new Map();

function broadcast(senderId, data) {
    const msg = JSON.stringify(data);
    players.forEach(({ ws }, id) => {
        if (id !== senderId && ws.readyState === 1) ws.send(msg);
    });
}

wss.on('connection', (ws) => {
    const id = nextId++;
    players.set(id, { ws, x: 0, y: 2, z: 0, yaw: 0 });
    ws.send(JSON.stringify({ type: 'id', id }));
    console.log(`Jugador ${id} conectado. Total: ${players.size}`);

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            if (data.type === 'state') {
                const p = players.get(id);
                if (p) { p.x = data.x; p.y = data.y; p.z = data.z; p.yaw = data.yaw; }
            }
            if (data.type === 'block_place' || data.type === 'block_break') {
                broadcast(id, data);
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        players.delete(id);
        console.log(`Jugador ${id} desconectado. Total: ${players.size}`);
    });
});

setInterval(() => {
    const lista = [];
    players.forEach((p, id) => {
        lista.push({ id, x: p.x, y: p.y, z: p.z, yaw: p.yaw });
    });
    const msg = JSON.stringify({ type: 'players', players: lista });
    players.forEach(({ ws }) => {
        if (ws.readyState === 1) ws.send(msg);
    });
}, 50);

console.log(`Servidor corriendo en puerto ${port}`);
