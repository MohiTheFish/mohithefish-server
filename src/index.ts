
console.log('started server');

import io, { Socket } from "socket.io";
import { v4 as uuid } from 'uuid';
import Player from './player';
import Room, {ConciseRoomInfo} from './room';

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
const userIdToPlayer = new Map<string, Player>();
const socketToUserId = new Map<string, string>();

export type PlayerData = {
  userId: string,
  username: string,
  gamename: string,
  disconnectTime: number,
};

export type RoomData = {
  userId: string;
  targetRoom: string;
};

gameChoices.forEach(game => {
  nameSpaceToRooms.set(game, []);
});


function deleteRoomFromNamespace(game: string, roomToDelete: Room) {
  const rooms: Array<Room> = nameSpaceToRooms.get(game)!;
  for(let i=0; i<rooms.length; i++){
    const room = rooms[i];
    if (room === roomToDelete) {
      rooms.splice(i, 1);
      break;
    }
  }
}


function deleteHost(room: Room, game:string) {
  const shouldDeleteRoom = room.removeHost();
  if (shouldDeleteRoom) {
    deleteRoomFromNamespace(game, room);
  }
}

// event fired every time a new client connects:
gameChoices.forEach(game => {
  server.of(game).on("connection", (socket: Socket) => {
    console.info(`Client connected [id=${socket.id}] and is playing ${game}`);
  
    // When user first connects, they send over some data about what game they are playing
    // They also provide their name.
    socket.on('initialConnection', function (data: PlayerData) {
      // console.log(data);
      // For disconnect, we want to be able to determine which player was the one that connected.
      socketToUserId.set(socket.id, data.userId);
      const player = userIdToPlayer.get(data.userId);
      if (player) {
        player.connectPlayer();
      }
      else {
        userIdToPlayer.set(data.userId, new Player(data));
      }
    });

    socket.on('createRoom', function(userId:string) {
      // Get player from their userId;
      const player = userIdToPlayer.get(userId)!;
      // If player is already in a room
      if (player.roomname) {
        const roomname = player.roomname;
        // Remove them from that room
        socket.leave(player.roomname);
        const index = rooms.get(roomname)!.removePlayer(player);
        server.of(game).to(player.roomname).emit('playerLeft', index);
      }

      // Create a new room id.
      const newRoomName = uuid();

      // Have socket listen on the room
      socket.join(newRoomName);

      // Create the new room
      const newRoom = new Room(newRoomName, player);
      
      // Add it to our dictionary
      rooms.set(newRoomName, newRoom);

      // Add it to list of rooms available for this game.
      nameSpaceToRooms.get(game)!.push(newRoom);

      console.log(newRoom);

      // Return room info.
      socket.emit('createdRoom', newRoom.getRoomInfo());
    });


    socket.on('getAvailableRooms', function(userId:string) {
      // Get player from their userId
      const player = userIdToPlayer.get(userId)!;
      // If user is ALREADY in a room (meaning they are deciding to switch to new room) remove them
      if (player.roomname) {
        const roomname = player.roomname;

        // Have client leave socket room
        socket.leave(roomname);
        const currentRoom = rooms.get(roomname)!;
        let index = -1;
        // Delete the player from the room, and return the index of where they were in the room. 
        if(currentRoom.host === player) {
          deleteHost(currentRoom, game);
        }
        else {
          index = currentRoom.removePlayer(player);
        }
        server.of(game).to(roomname).emit('playerLeft', index);
        // @TODO - users should be able to browse rooms without having to leave their room?
        
      }

      // Otherwise just iterate through all the rooms this namespace has. 
      // @TODO - Add checks for max occupancy.
      // Gonna do some additional cleaning here. 
      const candidateRooms = nameSpaceToRooms.get(game)!;
      console.log(candidateRooms);
      const availableRooms: Array<ConciseRoomInfo> = candidateRooms.map(room => room.getConciseRoomInfo());
      socket.emit('availableRooms', availableRooms);
    });

    socket.on('joinRoom', function(data: RoomData) {
      // The user is trying to join a room.
      const {targetRoom, userId} = data;
      const room = rooms.get(targetRoom);
      // If room exists
      if (room) {
        // Get player and add them to room;
        const player = userIdToPlayer.get(userId)!;
        room.addPlayer(player);

        console.log(`${userId} connecting to ${targetRoom}`);
        // Inform everyone currently in the room that someone else has joined.
        const roomInfo = room.getRoomInfo();
        server.of(game).to(targetRoom).emit('othersJoined', roomInfo);
        socket.join(targetRoom);
        // Inform original client that they have now joined.
        socket.emit('youJoined', roomInfo);
      }
      else {
        socket.emit('invalidRoom', `${targetRoom} was not found.`);
      }
    });
    
    // socket.on('leaveRoom', function(data: RoomData) {
    //   // First check if room exists.
    //   const {targetRoom, uuid} = data;
    //   const targetRoom
    //   const room = rooms.get(uuidToPlayer.get(targetRoom)!);
    //   if (room) {  
    //     // Have user leave. 
    //     socket.leave(targetRoom);
    //     if (room.members.length === 0) {
    //       rooms.delete(uuid);
    //     } else {
    //       room.removePlayer(uuidToPlayer.get(uuid)!);
    //     }
    //   }
    // });
    
    // when socket disconnects, remove it from the list:
    // also keep a time stamp since last login for player
    socket.on("forceDisconnect", function(){
      throw new Error('Client was force disconnected');
      const playerid = socketToUserId.get(socket.id)!;
      const player = userIdToPlayer.get(playerid)!;
      player.disconnectPlayer();
      socket.disconnect();
      console.info(`Client forced out [id=${socket.id}]`);
    });

    socket.on("disconnect", () => {

      // This event does should not rely on access to user data. Rely on our socket ids.
      const userId = socketToUserId.get(socket.id)!;
      // Get player from their userId
      const player = userIdToPlayer.get(userId)!;
      const roomname = player.roomname;
      if (roomname) {
        console.log(roomname);
        
        socket.leave(roomname);
        const room = rooms.get(roomname)!;
        let index = -1;
        if (player == room.host) {
          deleteHost(room, game);
        }
        else {
          index = room.removePlayer(player);
        }
        server.of(game).to(roomname).emit('playerLeft', index);
      }
      console.log(`Player who left: ${player.username}`);
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

