const { WebSocketServer } = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });

let nextId = 1;
const players = new Map();
const salas = new Map();

wss.on('connection', (ws) => {
    const id = nextId++;
    const salaId = id;
    players.set(id, { ws, x: 0, y: 2, z: 0, yaw: 0, salaId, mundo: null });
    salas.set(salaId, { mundo: null, bloques: [] });
    ws.send(JSON.stringify({ type: 'id', id, salaId }));
    console.log(`Jugador ${id} conectado. Total: ${players.size}`);

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            const player = players.get(id);
            if (!player) return;

            if (data.type === 'state') {
                player.x = data.x; player.y = data.y;
                player.z = data.z; player.yaw = data.yaw;
                if (data.mundo) {
                    player.mundo = data.mundo;
                    const sala = salas.get(player.salaId);
                    if (sala) sala.mundo = data.mundo;
                }
            }

            if (data.type === 'join_sala') {
                player.salaId = data.salaId;
                const sala = salas.get(data.salaId);
                if (sala) ws.send(JSON.stringify({ type: 'world_state', bloques: sala.bloques }));
            }

            if (data.type === 'get_salas') {
                const lista = [];
                salas.forEach((sala, sid) => {
                    if (!sala.mundo) return;
                    let count = 0;
                    players.forEach(p => { if (p.salaId === sid) count++; });
                    lista.push({ salaId: sid, mundo: sala.mundo, jugadores: count });
                });
                ws.send(JSON.stringify({ type: 'salas', salas: lista }));
            }

            if (data.type === 'block_place' || data.type === 'block_break') {
                const sala = salas.get(player.salaId);
                if (sala) {
                    if (data.type === 'block_place') {
                        sala.bloques.push({ x: data.x, y: data.y, z: data.z, mat: data.mat });
                    } else {
                        sala.bloques = sala.bloques.filter(b =>
                            !(Math.abs(b.x-data.x)<0.1 && Math.abs(b.y-data.y)<0.1 && Math.abs(b.z-data.z)<0.1)
                        );
                    }
                }
                players.forEach(({ ws: ws2 }, otherId) => {
                    if (otherId !== id && ws2.readyState === 1) {
                        const other = players.get(otherId);
                        if (other && other.salaId === player.salaId) ws2.send(JSON.stringify(data));
                    }
                });
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        const player = players.get(id);
        players.delete(id);
        salas.delete(id);
        if (player) {
            players.forEach(({ ws: ws2 }, otherId) => {
                const other = players.get(otherId);
                if (other && other.salaId === player.salaId && ws2.readyState === 1) {
                    ws2.send(JSON.stringify({ type: 'player_left', id }));
                }
            });
        }
        console.log(`Jugador ${id} desconectado. Total: ${players.size}`);
    });
});

setInterval(() => {
    players.forEach((receiver, receiverId) => {
        const lista = [];
        players.forEach((sender, senderId) => {
            if (senderId !== receiverId && sender.salaId === receiver.salaId && sender.mundo) {
                lista.push({ id: senderId, x: sender.x, y: sender.y, z: sender.z, yaw: sender.yaw });
            }
        });
        if (receiver.ws.readyState === 1) {
            receiver.ws.send(JSON.stringify({ type: 'players', players: lista }));
        }
    });
}, 50);

console.log(`Servidor corriendo en puerto ${port}`);
