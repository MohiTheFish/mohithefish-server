
console.log('started server');

import { Socket } from "socket.io";
import Player from './player';
import Room from './room';

const io = require("socket.io");
const server = io.listen(5000);
//http:localhost:5000/:game/:roomId

const gameChoices = ['/spyfall', '/tictactoe', '/war'];
const gameMD = new Map();

gameChoices.forEach(game => {
  gameMD.set(game, {
    nsp: server.of(game),
    rooms: [],
  })
})

const rooms = new Map();
const uuidToPlayer = new Map<string, Player>();
const socketIdTouuid = new Map<string, string>();

export type DataType = {
  uuid: string,
  username: string,
  gamename: string,
  disconnectTime: number,
};

// event fired every time a new client connects:
gameChoices.forEach(game => {
  server.of(game).on("connection", (socket: Socket) => {
    console.info(`Client connected [id=${socket.id}] and is playing ${game}`);
  
    // When user first connects, they send over some data about what game they are playing
    // They also provide their name.
    socket.on('initialConnection', function (data: DataType) {
      console.log(data);
      if (uuidToPlayer.has(data.uuid)) {
        uuidToPlayer.get(data.uuid)!.connectPlayer();
      }
      const p = new Player(data);
    });

    socket.on('createRoom', function(uuid:string) {
      socket.join(uuid);
      rooms.set(uuid, new Room(uuidToPlayer.get(uuid)))
      console.log('created a room');
      socket.emit('createdRoom', uuid);
    });
    
    // when socket disconnects, remove it from the list:
    // also keep a time stamp since last login for player
    socket.on("forceDisconnect", function(){
      const playerid = socketIdTouuid.get(socket.id)!;
      const player = uuidToPlayer.get(playerid)!;
      player.disconnectPlayer();
      socket.disconnect();
      console.info(`Client forced out [id=${socket.id}]`);
    });

    socket.on("disconnect", () => {
      const playerid = socketIdTouuid.get(socket.id)!;
      const player = uuidToPlayer.get(playerid)!;
      player.disconnectPlayer();
      console.info(`Client gone [id=${socket.id}]`);
    });

  });
})

server.of('/spyfall').on("connection", (socket: Socket) => {
  socket.on('hello world', function(data: any) {
    console.log(data);
    socket.emit('print', 'welcome');
  })
})

