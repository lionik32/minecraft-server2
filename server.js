const { WebSocketServer } = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });

let nextId = 1;
const players = new Map();          // id -> { ws, salaId, x, y, z, yaw, mundo, nombre, esMulti }
const salas = new Map();            // salaId -> { eventos: [], duenoId, posiciones: Map(id, {x,y,z,yaw}) }

wss.on('connection', (ws) => {
    const id = nextId++;
    // Inicialmente sin sala asignada
    players.set(id, { ws, salaId: null, x: 0, y: 2, z: 0, yaw: 0, mundo: null, nombre: null, esMulti: false });
    ws.send(JSON.stringify({ type: 'id', id })); // no enviamos salaId todavía
    console.log(`Jugador ${id} conectado. Total: ${players.size}`);

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            const player = players.get(id);
            if (!player) return;

            // ========== UNIRSE A UNA SALA ==========
            if (data.type === 'join') {
                const salaId = data.salaId;
                if (!salas.has(salaId)) {
                    // Crear nueva sala con este jugador como dueño
                    salas.set(salaId, { eventos: [], duenoId: id, posiciones: new Map() });
                    player.salaId = salaId;
                    player.esMulti = true;
                    player.mundo = data.mundo;
                    player.nombre = data.nombre;
                    // Guardar su posición inicial
                    salas.get(salaId).posiciones.set(id, { x: player.x, y: player.y, z: player.z, yaw: player.yaw });
                    ws.send(JSON.stringify({ type: 'joined', salaId, eventos: [] }));
                    console.log(`Sala ${salaId} creada por jugador ${id}`);
                } else {
                    // Unirse a sala existente
                    player.salaId = salaId;
                    player.esMulti = true;
                    player.mundo = data.mundo;
                    player.nombre = data.nombre;
                    const sala = salas.get(salaId);
                    // Guardar su posición actual (si la tenía localmente)
                    sala.posiciones.set(id, { x: player.x, y: player.y, z: player.z, yaw: player.yaw });
                    // Enviar todos los eventos históricos de la sala
                    ws.send(JSON.stringify({ type: 'world_init', eventos: sala.eventos }));
                    // Notificar al resto de jugadores de la sala que alguien se unió
                    players.forEach((p, otherId) => {
                        if (otherId !== id && p.salaId === salaId && p.ws.readyState === 1) {
                            p.ws.send(JSON.stringify({ type: 'player_joined', id }));
                        }
                    });
                    console.log(`Jugador ${id} se unió a sala ${salaId}`);
                }
                return;
            }

            // ========== ACTUALIZAR POSICIÓN ==========
            if (data.type === 'state') {
                player.x = data.x;
                player.y = data.y;
                player.z = data.z;
                player.yaw = data.yaw;
                player.esMulti = data.esMulti;
                if (data.mundo) player.mundo = data.mundo;
                if (data.nombre) player.nombre = data.nombre;
                if (player.salaId && salas.has(player.salaId)) {
                    salas.get(player.salaId).posiciones.set(id, { x: player.x, y: player.y, z: player.z, yaw: player.yaw });
                }
            }

            // ========== LISTA DE SALAS ==========
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

            // ========== EVENTOS DE BLOQUES (colocar/romper) ==========
            if (data.type === 'block_place' || data.type === 'block_break') {
                if (!player.salaId) return;
                const sala = salas.get(player.salaId);
                if (!sala) return;
                // Almacenar evento
                sala.eventos.push(data);
                // Reenviar a todos los jugadores de la misma sala (incluido el propio, aunque él ya lo tiene localmente)
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

        // Si era dueño, cerrar la sala y expulsar a todos
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
            // Solo notificar salida
            players.forEach((p, otherId) => {
                if (otherId !== id && p.salaId === salaId && p.ws.readyState === 1) {
                    p.ws.send(JSON.stringify({ type: 'player_left', id }));
                }
            });
            // Eliminar su posición guardada
            salas.get(salaId).posiciones.delete(id);
        }

        players.delete(id);
        console.log(`Jugador ${id} desconectado. Total: ${players.size}`);
    });
});

// ========== ENVÍO PERIÓDICO DE POSICIONES ==========
setInterval(() => {
    for (let [receiverId, receiver] of players.entries()) {
        if (!receiver.salaId || !salas.has(receiver.salaId)) continue;
        const lista = [];
        for (let [senderId, sender] of players.entries()) {
            if (senderId !== receiverId && sender.salaId === receiver.salaId && sender.ws.readyState === 1) {
                lista.push({ id: senderId, x: sender.x, y: sender.y, z: sender.z, yaw: sender.yaw, esMulti: sender.esMulti });
            }
        }
        if (receiver.ws.readyState === 1) {
            receiver.ws.send(JSON.stringify({ type: 'players', players: lista }));
        }
    }
}, 50);

console.log(`Servidor corriendo en puerto ${port}`);
