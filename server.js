const { WebSocketServer } = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });

let nextId = 1;
const players = new Map();
const worldBlocks = { plano: [], normal: [] };

function broadcast(senderId, data) {
    const msg = JSON.stringify(data);
    players.forEach(({ ws }, id) => {
        if (id !== senderId && ws.readyState === 1) ws.send(msg);
    });
}

wss.on('connection', (ws) => {
    const id = nextId++;
    players.set(id, { ws, x: 0, y: 2, z: 0, yaw: 0, mundo: null });
    ws.send(JSON.stringify({ type: 'id', id }));

// Enviar estado del mundo cuando el cliente avise su mundo
// (se hace en el primer mensaje de estado)
    console.log(`Jugador ${id} conectado. Total: ${players.size}`);

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            if (data.type === 'state') {
    const p = players.get(id);
    if (p) {
        const mundoAnterior = p.mundo;
        p.x = data.x; p.y = data.y; p.z = data.z; p.yaw = data.yaw; p.mundo = data.mundo;

        // Primera vez que manda su mundo: enviarle el estado actual
        if (!mundoAnterior && data.mundo && worldBlocks[data.mundo]) {
            worldBlocks[data.mundo].forEach(bloque => {
                ws.send(JSON.stringify({ type: 'block_place', ...bloque }));
            });
        }
    }
            }
            if (data.type === 'block_place' || data.type === 'block_break') {
    const sender = players.get(id);
    const mundo = sender.mundo || 'plano';

    if (data.type === 'block_place') {
        worldBlocks[mundo].push({ x: data.x, y: data.y, z: data.z, mat: data.mat });
    } else if (data.type === 'block_break') {
        worldBlocks[mundo] = worldBlocks[mundo].filter(b =>
            !(Math.abs(b.x - data.x) < 0.1 && Math.abs(b.y - data.y) < 0.1 && Math.abs(b.z - data.z) < 0.1)
        );
    }

    players.forEach(({ ws }, otherId) => {
        if (otherId !== id && ws.readyState === 1 && players.get(otherId).mundo === mundo) {
            ws.send(JSON.stringify(data));
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
    // For each player (the receiver)
    players.forEach((receiverData, receiverId) => {
        const filteredList = [];

        // Check all players to see who is in the same world as the receiver
        players.forEach((playerData, playerId) => {
            if (playerData.mundo === receiverData.mundo) {
                filteredList.push({
                    id: playerId,
                    x: playerData.x,
                    y: playerData.y,
                    z: playerData.z,
                    yaw: playerData.yaw
                });
            }
        });

        const msg = JSON.stringify({ 
            type: 'players', 
            players: filteredList 
        });

        if (receiverData.ws.readyState === 1) {
            receiverData.ws.send(msg);
        }
    });
}, 50);


console.log(`Servidor corriendo en puerto ${port}`);
