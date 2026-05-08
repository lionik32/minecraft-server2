const { WebSocketServer } = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });

let nextId = 1;
let nextSalaId = 1;
const players = new Map();
const worldBlocks = {};

wss.on('connection', (ws) => {
    const id = nextId++;
    // Asignar salaId único a este jugador (su propio mundo)
    const salaId = nextSalaId++;
    players.set(id, { ws, x: 0, y: 2, z: 0, yaw: 0, mundo: null, esMulti: false, salaId });
    ws.send(JSON.stringify({ type: 'id', id, salaId }));
    console.log(`Jugador ${id} conectado. Total: ${players.size}`);

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);

            if (data.type === 'get_salas') {
                const salas = [];
                players.forEach((p) => {
                    if (p.mundo) {
                        // Contar cuántos jugadores están en esta sala
                        let jugadores = 0;
                        players.forEach(p2 => { if (p2.salaId === p.salaId) jugadores++; });
                        // Solo mostrar una vez por salaId
                        if (!salas.find(s => s.salaId === p.salaId)) {
                            salas.push({ mundo: p.mundo, jugadores, salaId: p.salaId });
                        }
                    }
                });
                ws.send(JSON.stringify({ type: 'salas', salas }));
                return;
            }

            if (data.type === 'state') {
                const p = players.get(id);
                if (p) {
                    const mundoAnterior = p.mundo;
                    const salaIdAnterior = p.salaId;
                    p.x = data.x; p.y = data.y; p.z = data.z;
                    p.yaw = data.yaw; p.mundo = data.mundo;
                    p.esMulti = data.esMulti;
                    // Si viene con salaId (se unió a sala de otro), usarlo
                    if (data.salaId) p.salaId = data.salaId;

                    // Cuando entra en modo multi por primera vez en esta sala
if (data.esMulti && data.salaId && data.salaId !== salaIdAnterior) {
    const bloques = worldBlocks[data.salaId] || [];
    if (bloques.length > 0) {
        ws.send(JSON.stringify({ type: 'world_state', bloques }));
    }
}
                }
            }

            if (data.type === 'block_place' || data.type === 'block_break') {
                const sender = players.get(id);
                if (!sender) return;
                const salaId = sender.salaId;

                if (!worldBlocks[salaId]) worldBlocks[salaId] = [];
                if (data.type === 'block_place') {
                    worldBlocks[salaId].push({ x: data.x, y: data.y, z: data.z, mat: data.mat });
                } else {
                    worldBlocks[salaId] = worldBlocks[salaId].filter(b =>
                        !(Math.abs(b.x - data.x) < 0.1 && Math.abs(b.y - data.y) < 0.1 && Math.abs(b.z - data.z) < 0.1)
                    );
                }

                if (sender.esMulti) {
                    players.forEach(({ ws: ws2 }, otherId) => {
                        const other = players.get(otherId);
                        if (otherId !== id && ws2.readyState === 1 && other.salaId === salaId && other.esMulti) {
                            ws2.send(JSON.stringify(data));
                        }
                    });
                }
            }

        } catch (e) {}
    });

    ws.on('close', () => {
        const playerSaliente = players.get(id);
        players.delete(id);
        console.log(`Jugador ${id} desconectado. Total: ${players.size}`);
        if (playerSaliente && playerSaliente.mundo) {
            players.forEach(({ ws: ws2 }, otherId) => {
                const other = players.get(otherId);
                if (other && other.salaId === playerSaliente.salaId && ws2.readyState === 1) {
                    ws2.send(JSON.stringify({ type: 'player_left', id }));
                }
            });
        }
    });
});

setInterval(() => {
    players.forEach((receiverData, receiverId) => {
        const filteredList = [];
        players.forEach((playerData, playerId) => {
            if (playerData.salaId === receiverData.salaId && playerData.esMulti) {
                filteredList.push({
                    id: playerId,
                    x: playerData.x,
                    y: playerData.y,
                    z: playerData.z,
                    yaw: playerData.yaw,
                    esMulti: playerData.esMulti
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
