const { WebSocketServer } = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });

let nextId = 1;
const players = new Map();
const worldBlocks = {};

wss.on('connection', (ws) => {
    const id = nextId++;
    const salaId = id;
    players.set(id, { ws, x: 0, y: 2, z: 0, yaw: 0, salaId, mundo: null, esMulti: false });
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
                player.esMulti = data.esMulti;
                if (data.mundo) player.mundo = data.mundo;
                if (data.salaId && data.salaId !== player.salaId) {
                    player.salaId = data.salaId;
                    if (data.esMulti) {
                        // Notificar al dueño de la sala
                        players.forEach(({ ws: ws2 }, otherId) => {
                            const other = players.get(otherId);
                            if (otherId !== id && ws2.readyState === 1 && other.salaId === data.salaId) {
                                ws2.send(JSON.stringify({ type: 'player_joined' }));
                            }
                        });
                    }
                } else if (data.salaId) {
                    player.salaId = data.salaId;
                }
            }

            if (data.type === 'get_salas') {
                const lista = [];
                const vistas = new Set();
                players.forEach((p) => {
                    if (!p.mundo || vistas.has(p.salaId)) return;
                    vistas.add(p.salaId);
                    let count = 0;
                    players.forEach(p2 => { if (p2.salaId === p.salaId) count++; });
                    lista.push({ salaId: p.salaId, mundo: p.mundo, jugadores: count });
                });
                ws.send(JSON.stringify({ type: 'salas', salas: lista }));
            }

            if (data.type === 'mundo_completo') {
                players.forEach(({ ws: ws2 }, otherId) => {
                    const other = players.get(otherId);
                    if (otherId !== id && ws2.readyState === 1 && other.salaId === player.salaId && other.esMulti) {
                        ws2.send(JSON.stringify({ type: 'mundo_completo', rotos: data.rotos, manuales: data.manuales }));
                    }
                });
            }

            if (data.type === 'block_place' || data.type === 'block_break') {
                const sid = player.salaId;
                if (!worldBlocks[sid]) worldBlocks[sid] = [];
                if (data.type === 'block_place') {
                    worldBlocks[sid].push({ x: data.x, y: data.y, z: data.z, mat: data.mat, type: 'place' });
                } else {
                    worldBlocks[sid] = worldBlocks[sid].filter(b =>
                        !(Math.abs(b.x-data.x)<0.1 && Math.abs(b.y-data.y)<0.1 && Math.abs(b.z-data.z)<0.1)
                    );
                    worldBlocks[sid].push({ x: data.x, y: data.y, z: data.z, type: 'break' });
                }
                if (player.esMulti) {
                    players.forEach(({ ws: ws2 }, otherId) => {
                        const other = players.get(otherId);
                        if (otherId !== id && ws2.readyState === 1 && other.salaId === sid && other.esMulti) {
                            ws2.send(JSON.stringify(data));
                        }
                    });
                }
            }

        } catch (e) {}
    });

    ws.on('close', () => {
        const player = players.get(id);
        players.delete(id);
        console.log(`Jugador ${id} desconectado. Total: ${players.size}`);
        if (player) {
            players.forEach(({ ws: ws2 }, otherId) => {
                const other = players.get(otherId);
                if (other && other.salaId === player.salaId && ws2.readyState === 1) {
                    ws2.send(JSON.stringify({ type: 'player_left', id }));
                }
            });
        }
    });
});

setInterval(() => {
    players.forEach((receiver, receiverId) => {
        const lista = [];
        players.forEach((sender, senderId) => {
            if (senderId !== receiverId && sender.salaId === receiver.salaId && sender.mundo && sender.esMulti) {
                lista.push({ id: senderId, x: sender.x, y: sender.y, z: sender.z, yaw: sender.yaw, esMulti: sender.esMulti });
            }
        });
        if (receiver.ws.readyState === 1) {
            receiver.ws.send(JSON.stringify({ type: 'players', players: lista }));
        }
    });
}, 50);

console.log(`Servidor corriendo en puerto ${port}`);
