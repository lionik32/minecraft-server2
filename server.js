const { WebSocketServer } = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });

let nextId = 1;
const players = new Map();          // id -> { ws, salaId, x, y, z, yaw, mundo, nombre, esDueno }
const salas = new Map();            // salaId -> { eventos: [], duenoId, posiciones: Map, mundo, nombre }

wss.on('connection', (ws) => {
    const id = nextId++;
    players.set(id, { ws, salaId: null, x: 0, y: 2, z: 0, yaw: 0, mundo: null, nombre: null, esDueno: false });
    ws.send(JSON.stringify({ type: 'id', id }));
    console.log(`Jugador ${id} conectado. Total: ${players.size}`);

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            const player = players.get(id);
            if (!player) return;

            // Registrar un mundo (solitario) para que aparezca en la lista de salas
            if (data.type === 'register_world') {
                const salaId = data.salaId;
                const mundo = data.mundo;
                const nombre = data.nombre;
                if (!salas.has(salaId)) {
                    salas.set(salaId, {
                        eventos: [],
                        duenoId: id,
                        posiciones: new Map(),
                        mundo: mundo,
                        nombre: nombre
                    });
                    player.salaId = salaId;
                    player.mundo = mundo;
                    player.nombre = nombre;
                    player.esDueno = true;
                    console.log(`Mundo ${salaId} registrado por ${id} (${nombre})`);
                }
                return;
            }

            // Unirse a una sala (modo multijugador normal)
            if (data.type === 'join') {
                const salaId = data.salaId;
                const mundo = data.mundo;
                const nombre = data.nombre;

                if (!salas.has(salaId)) {
                    // Crear nueva sala
                    salas.set(salaId, {
                        eventos: [],
                        duenoId: id,
                        posiciones: new Map(),
                        mundo: mundo,
                        nombre: nombre
                    });
                    player.salaId = salaId;
                    player.mundo = mundo;
                    player.nombre = nombre;
                    player.esDueno = true;
                    salas.get(salaId).posiciones.set(id, { x: player.x, y: player.y, z: player.z, yaw: player.yaw });
                    ws.send(JSON.stringify({ type: 'joined', salaId, eventos: [] }));
                    console.log(`Sala ${salaId} creada por ${id} (${nombre})`);
                } else {
                    // Notificar al dueño que alguien se une
                    const sala = salas.get(salaId);
                    const dueno = players.get(sala.duenoId);
                    if (dueno && dueno.ws.readyState === 1) {
                        dueno.ws.send(JSON.stringify({ type: 'player_join_request', id }));
                    }
                    // Unir al nuevo jugador
                    player.salaId = salaId;
                    player.mundo = mundo;
                    player.nombre = nombre;
                    sala.posiciones.set(id, { x: player.x, y: player.y, z: player.z, yaw: player.yaw });
                    ws.send(JSON.stringify({ type: 'world_init', eventos: sala.eventos }));
                    // Notificar a otros jugadores de la sala
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
                player.pitch = data.pitch || 0;
                player.moving = !!data.moving;
                player.placing = !!data.placing;
                if (data.mundo) player.mundo = data.mundo;
                if (data.nombre) player.nombre = data.nombre;
                if (player.salaId && salas.has(player.salaId)) {
                    salas.get(player.salaId).posiciones.set(id, { x: player.x, y: player.y, z: player.z, yaw: player.yaw });
                }
            }

            // Lista de salas (incluye mundos registrados)
            if (data.type === 'get_salas') {
                const lista = [];
                for (let [salaId, sala] of salas.entries()) {
                    const dueno = players.get(sala.duenoId);
                    if (!dueno) continue;
                    let count = 0;
                    for (let p of players.values()) {
                        if (p.salaId === salaId && p.ws.readyState === 1) count++;
                    }
                    lista.push({ salaId, mundo: sala.mundo, nombre: sala.nombre, jugadores: count });
                }
                ws.send(JSON.stringify({ type: 'salas', salas: lista }));
            }

            // Eventos de bloques
            if (data.type === 'block_place' || data.type === 'block_break') {
                if (!player.salaId) return;
                const sala = salas.get(player.salaId);
                if (!sala) return;
                const yaExiste = sala.eventos.some(e =>
    e.type === data.type &&
    Math.abs(e.x - data.x) < 0.1 &&
    Math.abs(e.y - data.y) < 0.1 &&
    Math.abs(e.z - data.z) < 0.1
);
if (!yaExiste) sala.eventos.push(data);
players.forEach((p, otherId) => {
    if (otherId !== id && p.salaId === player.salaId && p.ws.readyState === 1) {
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
                lista.push({ id: senderId, x: sender.x, y: sender.y, z: sender.z, yaw: sender.yaw, pitch: sender.pitch || 0, moving: sender.moving || false, placing: sender.placing || false });
            }
        }
        if (receiver.ws.readyState === 1) {
            receiver.ws.send(JSON.stringify({ type: 'players', players: lista }));
        }
    }
}, 50);

console.log(`Servidor multijugador corriendo en puerto ${port}`);
