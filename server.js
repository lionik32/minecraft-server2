const { WebSocketServer } = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });

let nextId = 1;
const players = new Map();

wss.on('connection', (ws) => {
    const id = nextId++;
    players.set(id, { ws, x: 0, y: 2, z: 0, yaw: 0, mundo: null });
    ws.send(JSON.stringify({ type: 'id', id }));
    console.log(`Jugador ${id} conectado. Total: ${players.size}`);

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);

            if (data.type === 'get_salas') {
                const salas = {};
                players.forEach((p) => {
                    if (p.mundo) {
                        if (!salas[p.mundo]) salas[p.mundo] = 0;
                        salas[p.mundo]++;
                    }
                });
                const lista = Object.entries(salas).map(([mundo, jugadores]) => ({ mundo, jugadores }));
                ws.send(JSON.stringify({ type: 'salas', salas: lista }));
                return;
            }

            if (data.type === 'state') {
    const p = players.get(id);
    if (p) {
        p.x = data.x; p.y = data.y; p.z = data.z;
        p.yaw = data.yaw; p.mundo = data.mundo;
        p.esMulti = data.esMulti;
    }
            }

            if (data.type === 'block_place' || data.type === 'block_break') {
                const sender = players.get(id);
                const mundo = sender ? sender.mundo : null;
                players.forEach(({ ws: ws2 }, otherId) => {
                    if (otherId !== id && ws2.readyState === 1 && players.get(otherId).mundo === mundo) {
                        ws2.send(JSON.stringify(data));
                    }
                });
            }

        } catch (e) {}
    });

    ws.on('close', () => {
        players.delete(id);
        console.log(`Jugador ${id} desconectado. Total: ${players.size}`);
    });
});

setInterval(() => {
    players.forEach((receiverData, receiverId) => {
        const filteredList = [];
        players.forEach((playerData, playerId) => {
            if (players.forEach((playerData, playerId) => {
    if (playerData.mundo === receiverData.mundo && playerData.esMulti) {
        filteredList.push({
            id: playerId,
            x: playerData.x,
            y: playerData.y,
            z: playerData.z,
            yaw: playerData.yaw
        });
    }
});
        const msg = JSON.stringify({ type: 'players', players: filteredList });
        if (receiverData.ws.readyState === 1) {
            receiverData.ws.send(msg);
        }
    });
}, 50);

console.log(`Servidor corriendo en puerto ${port}`);
