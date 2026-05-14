const { WebSocketServer } = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });

let nextId = 1;
const players = new Map();          // id -> { ws, salaId, x, y, z, yaw, mundo, nombre }
const salas = new Map();            // salaId -> { eventos: [], duenoId, posiciones: Map }

wss.on('connection', (ws) => {
    const id = nextId++;
    players.set(id, { ws, salaId: null, x: 0, y: 2, z: 0, yaw: 0, mundo: null, nombre: null });
    ws.send(JSON.stringify({ type: 'id', id }));
    console.log(`Jugador ${id} conectado. Total: ${players.size}`);

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            const player = players.get(id);
            if (!player) return;

            // Unirse a una sala
            if (data.type === 'join') {
                const salaId = data.salaId;
                const mundo = data.mundo;
                const nombre = data.nombre;

                if (!salas.has(salaId)) {
                    salas.set(salaId, {
                        eventos: [],
                        duenoId: id,
                        posiciones: new Map()
                    });
                    player.salaId = salaId;
                    player.mundo = mundo;
                    player.nombre = nombre;
                    salas.get(salaId).posiciones.set(id, { x: player.x, y: player.y, z: player.z, yaw: player.yaw });
                    ws.send(JSON.stringify({ type: 'joined', salaId, eventos: [] }));
                    console.log(`Sala ${salaId} creada por ${id} (${nombre})`);
                } else {
                    player.salaId = salaId;
                    player.mundo = mundo;
                    player.nombre = nombre;
                    const sala = salas.get(salaId);
                    sala.posiciones.set(id, { x: player.x, y: player.y, z: player.z, yaw: player.yaw });
                    ws.send(JSON.stringify({ type: 'world_init', eventos: sala.eventos }));
                    players.forEach((p, otherId) => {
                        if (otherId !== id && p.salaId === salaId && p.ws.readyState === 1) {
                            p.ws.send(JSON.stringify({ type: 'player_joined', id }));
                        }
                    });
                    console.log(`Jugador ${id} se unió a sala ${salaId}`);
                }
                return;
            }

            // Actualizar posición
            if (data.type === 'state') {
                player.x = data.x;
                player.y = data.y;
                player.z = data.z;
                player.yaw = data.yaw;
                if (data.mundo) player.mundo = data.mundo;
                if (data.nombre) player.nombre = data.nombre;
                if (player.salaId && salas.has(player.salaId)) {
                    salas.get(player.salaId).posiciones.set(id, { x: player.x, y: player.y, z: player.z, yaw: player.yaw });
                }
            }

            // Lista de salas
            if (data.type === 'get_salas') {
                const lista = [];
                for (let [salaId, sala] of salas.entries()) {
                    const dueno = players.get(sala.duenoId);
                    if (!dueno) continue;
                    let count = 0;
                    for (let p of players.values()) {
                        if (p.salaId === salaId && p.ws.readyState === 1) count++;
                    }
                    lista.push({ salaId, mundo: dueno.mundo, nombre: dueno.nombre || dueno.mundo, jugadores: count });
                }
                ws.send(JSON.stringify({ type: 'salas', salas: lista }));
            }

            // Eventos de bloques
            if (data.type === 'block_place' || data.type === 'block_break') {
                if (!player.salaId) return;
                const sala = salas.get(player.salaId);
                if (!sala) return;
                sala.eventos.push(data);
                players.forEach((p, otherId) => {
                    if (p.salaId === player.salaId && p.ws.readyState === 1) {
                        p.ws.send(JSON.stringify(data));
                    }
                });
            }

        } catch (e) { console.error(e); }
    });

    ws.on('close', () => {
        const player = players.get(id);
        if (!player) return;
        const salaId = player.salaId;
        const esDueno = salaId && salas.has(salaId) && salas.get(salaId).duenoId === id;

        if (esDueno) {
            const sala = salas.get(salaId);
            if (sala) {
                players.forEach((p, otherId) => {
                    if (otherId !== id && p.salaId === salaId && p.ws.readyState === 1) {
                        p.ws.send(JSON.stringify({ type: 'sala_cerrada' }));
                        p.salaId = null;
                    }
                });
                salas.delete(salaId);
                console.log(`Sala ${salaId} cerrada por dueño ${id}`);
            }
        } else if (salaId && salas.has(salaId)) {
            players.forEach((p, otherId) => {
                if (otherId !== id && p.salaId === salaId && p.ws.readyState === 1) {
                    p.ws.send(JSON.stringify({ type: 'player_left', id }));
                }
            });
            salas.get(salaId).posiciones.delete(id);
        }

        players.delete(id);
        console.log(`Jugador ${id} desconectado. Total: ${players.size}`);
    });
});

setInterval(() => {
    for (let [receiverId, receiver] of players.entries()) {
        if (!receiver.salaId || !salas.has(receiver.salaId)) continue;
        const lista = [];
        for (let [senderId, sender] of players.entries()) {
            if (senderId !== receiverId && sender.salaId === receiver.salaId && sender.ws.readyState === 1) {
                lista.push({ id: senderId, x: sender.x, y: sender.y, z: sender.z, yaw: sender.yaw });
            }
        }
        if (receiver.ws.readyState === 1) {
            receiver.ws.send(JSON.stringify({ type: 'players', players: lista }));
        }
    }
}, 50);

console.log(`Servidor multijugador corriendo en puerto ${port}`);
