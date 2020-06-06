
console.log('started server');

import io, { Socket } from "socket.io";
import Player from './player';
import Room from './room';

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

const nameSpaceToRooms = new Map<string, Room[]>();
const rooms = new Map<string, Room>();
const uuidToPlayer = new Map<string, Player>();
const socketIdTouuid = new Map<string, string>();

export type PlayerData = {
  uuid: string,
  username: string,
  gamename: string,
  disconnectTime: number,
};

export type RoomData = {
  uuid: string;
  targetRoom: string;
};

gameChoices.forEach(game => {
  nameSpaceToRooms.set(game, []);
});

// event fired every time a new client connects:
gameChoices.forEach(game => {
  server.of(game).on("connection", (socket: Socket) => {
    console.info(`Client connected [id=${socket.id}] and is playing ${game}`);
  
    // When user first connects, they send over some data about what game they are playing
    // They also provide their name.
    socket.on('initialConnection', function (data: PlayerData) {
      console.log(data);
      socketIdTouuid.set(socket.id, data.uuid);
      const player = uuidToPlayer.get(data.uuid);
      if (player) {
        player.connectPlayer();
      }
      else {
        uuidToPlayer.set(data.uuid, new Player(data));
      }
    });

    socket.on('createRoom', function(uuid:string) {
      const player = uuidToPlayer.get(uuid)!;
      let newRoom = null;
      if(!rooms.has(uuid)) {
        newRoom = new Room(uuid, player.username);
        rooms.set(uuid, newRoom);
        nameSpaceToRooms.get(game)!.push(newRoom);
      }
      else {
        newRoom = rooms.get(uuid)!;
      }
      socket.emit('createdRoom', newRoom.getRoomInfo());
    });


    socket.on('getAvailableRooms', function(uuid){
      //If user decides they want to join a room instead of create one,
      if (rooms.has(uuid)) {  
        //we should have them leave to be sure they aren't left over as a player.
        const room = rooms.get(uuid)!;
        socket.leave(uuid); 
        if (room.members.length === 0) {
          rooms.delete(uuid);
        } else {
          room.removeHost();
        }
      }

      const availableRooms = nameSpaceToRooms.get(game)!.map(room => room.getRoomInfo());
      socket.emit('availableRooms', availableRooms);
    });

    socket.on('joinRoom', function(data: RoomData) {
      const room = rooms.get(data.targetRoom);
      if (room) {
        room.addPlayer(data.uuid);
        const roomInfo = room.getRoomInfo();
        server.to(data.uuid).emit('othersJoined', roomInfo);
        socket.emit('youJoined', roomInfo);
      }
      else {
        socket.emit('invalidRoom', `${data.targetRoom} was not found.`);
      }
    });
    
    socket.on('leaveRoom', function(data: RoomData) {
      socket.leave(data.uuid);
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
      console.log(socket.id);
      const uid = socketIdTouuid.get(socket.id)!;
      console.log(uid);
      const player = uuidToPlayer.get(uid)!;
      console.log(player);
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

