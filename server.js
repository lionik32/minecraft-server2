console.log(`Servidor corriendo en puerto ${port}`);            }
            

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
