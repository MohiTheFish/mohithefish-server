
import io, {Socket} from "socket.io";
import { v4 as uuid } from 'uuid';
import Player from './player';
import Room, {ConciseRoomInfo} from './room';
import SpyfallRoom from './Room/spyfall';
import MafiaRoom from "./Room/mafia";

var allowedOrigins = "http://mohithefish.github.io/:* http://mohithefish.github.io:*";
const server = io.listen((process.env.PORT || 5000), {
  origins: "*:*"
  // origins: allowedOrigins
});

//http:localhost:5000/:game/:roomId

/** Supported game choices */
const gameChoices = ['spyfall', 'mafia'];
/** Maps a gametype to the list of rooms of that gametype */
const nameSpaceToRooms = new Map<string, Room[]>();
/** Maps roomId to the room itself */
const rooms = new Map<string, Room>();
/** Maps the user's ID to the player */
const userIdToPlayer = new Map<string, Player>();
/** Maps the socketId to the userId */
const socketToUserId = new Map<string, string>();

/**
 * RoomData
 * * userId: the user trying to join
 * * targetRoom: the roomId the user is trying to join
 * * submittedId: (currently unused) detects whether user manually provided the roomId
 */
export type RoomData = {
  userId: string;
  targetRoom: string;
  submittedId: boolean;
};
// Initialize the map of game to rooms.
gameChoices.forEach(game => {
  nameSpaceToRooms.set(game, []);
});


/**
 * If the host leaves and all the members have left, the room needs to be removed entirely. 
 * @param nameSpaceToRooms The map used by the server to track which rooms are part of which game type
 */
function deleteRoomFromNamespace(targetRoom: Room) {
    const rooms: Array<Room> = nameSpaceToRooms.get(targetRoom.roomType)!;
    for(let i=0; i<rooms.length; i++){
      const room = rooms[i];
      if (room === targetRoom) {
        room.end();
        room.informSpectators();
        rooms.splice(i, 1);
        break;
      }
    }
  }

function ejectPlayer(socket: io.Socket) : Player | undefined {
  const userId = socketToUserId.get(socket.id);
  if (!userId) {return;}
  const player = userIdToPlayer.get(userId)!;
  const roomId = player.roomId;
  // If player is already in a room
  if (roomId) {
    // Remove them from that room
    const currentRoom = rooms.get(roomId)!;
    const shouldDeleteRoom = currentRoom.removePlayer(player);
    if(shouldDeleteRoom) {
      deleteRoomFromNamespace(currentRoom);
      rooms.delete(roomId);
    }
  }
  return player;
}

// event fired every time a new client connects:
server.on("connection", (socket: Socket) => {
  // console.info(`Client connected [id=${socket.id}] and is playing ${game}`);

  // When user first connects, they send over some data about what game they are playing
  // They also provide their name.
  socket.on('initialConnection', function (userId: string) {
    // For disconnect, we want to be able to determine which player was the one that connected.
    socketToUserId.set(socket.id, userId);
    const player = userIdToPlayer.get(userId);
    if (player) {
      player.connectPlayer(socket);
    }
    else {
      userIdToPlayer.set(userId, new Player(userId, socket));
    }
  });

  
  socket.on('updateMyName', function([userId, username]){
    const player = userIdToPlayer.get(userId)!;
    player.updateName(username);
    socket.emit('nameUpdated', player.username);
  });

  socket.on('createRoom', function(args: any[]) {
    const [userId, game, settings] = args;

    // Get player from their userId;
    const player = userIdToPlayer.get(userId)!;

    // Create a new room id.
    const newroomId = uuid();

    // Have socket listen on the room
    socket.join(newroomId);

    // Create the new room
    let newRoom: any;
    switch(game) {
      case gameChoices[0]: {
        newRoom = new SpyfallRoom(newroomId, player, server, settings);
        break;
      }
      case gameChoices[1]: {
        newRoom = new MafiaRoom(newroomId, player, server, settings);
        break;
      }
      default: {
        newRoom = new Room(newroomId, player, server, 'basic');
      }
    }
    
    // Add it to our dictionary
    rooms.set(newroomId, newRoom);

    // Add it to list of rooms available for this game.
    nameSpaceToRooms.get(game)!.push(newRoom);

    socket.emit('createdRoom', newRoom.getRoomInfo());
  });

  socket.on('updateSettings', function(args: any[]){
    const [userId, settings] = args;
    // Get player from their userId;
    const player = userIdToPlayer.get(userId)!; 

    // Get room player is in.
    const room = rooms.get(player.roomId)!; 

    // Update room settings
    const newSettings = room.updateSettings(settings);

    // Inform players
    server.to(player.roomId).emit('settingsUpdated', newSettings)
  });

  socket.on('togglePrivateRoom', function(userId: string) {
    const player = userIdToPlayer.get(userId)!; 
    const room = rooms.get(player.roomId)!; 
    const newPrivate = room.togglePrivate();
    socket.emit('toggledPrivate', newPrivate);
  });

  socket.on('ejectPlayerFromRoom', function() {
    ejectPlayer(socket);
  });

  socket.on('getAvailableRooms', function(game: string) {
    // Get player from their userId
    ejectPlayer(socket);

    // Otherwise just iterate through all the rooms this namespace has. 
    const candidateRooms = nameSpaceToRooms.get(game)!;
    
    const availableRooms: Array<ConciseRoomInfo> = [];
    candidateRooms.forEach(room => {
      if (!room.isPrivate) {
        availableRooms.push(room.getConciseRoomInfo());
      }
    });
    socket.emit('availableRooms', availableRooms);
  });

  socket.on('joinRoom', function(data: RoomData) {
    // The user is trying to join a room.
    const {targetRoom, userId, submittedId} = data;
    const room = rooms.get(targetRoom);
    // If room exists
    
    if (room) {
      // Get player and add them to room;
      const player = userIdToPlayer.get(userId)!;
      room.addPlayer(player);
    }
    else {
      socket.emit('invalidRoom', `${targetRoom} was not found.`);
    }
  });

  socket.on('startGame', function(userId: string) {
    // Get player from their id.
    const player = userIdToPlayer.get(userId)!;
    // Get the room they are in.
    const roomId = player.roomId;
    const room = (rooms.get(roomId)!);
    // Start the game and return game information.
    room.begin();
    
    // The players are notified inside of the begin function for their respective game.
  });

  socket.on('returnToLobby', function(userId: string) {
    const player = userIdToPlayer.get(userId)!;
    const roomId = player.roomId;
    const room = (rooms.get(roomId)!);
    room.end();
    room.returnToLobby(nameSpaceToRooms);
  });

  // socket.on("forceDisconnect", function(){
  //   throw new Error('Client was force disconnected');
  //   const playerid = socketToUserId.get(socket.id)!;
  //   const player = userIdToPlayer.get(playerid)!;
  //   player.disconnectPlayer();
  //   socket.disconnect();
  //   console.info(`Client forced out [id=${socket.id}]`);
  // });

  socket.on("disconnect", () => {
    // Remove player if they are in a room
    const player = ejectPlayer(socket);
    if (player){
      player.disconnectPlayer();
    }
  });


  socket.on('sendMafiaMessage', function({userId, index, message}) {
    const player = userIdToPlayer.get(userId)!;
    const room = (<MafiaRoom> (rooms.get(player.roomId)!));
    room.updateChat(index, userId, message);
  });

  socket.on('voteMafiaPlayer', function({userId, myIndex, targetIndex}) {
    const player = userIdToPlayer.get(userId)!;
    const room = (<MafiaRoom> (rooms.get(player.roomId)!));
    room.votePlayer(myIndex, targetIndex);
  });

  socket.on('voteMafiaGuilty', function({userId, myIndex, decision}) {
    const player = userIdToPlayer.get(userId)!;
    const room = (<MafiaRoom> (rooms.get(player.roomId)!));
    room.voteGuilty(myIndex, decision);
  });
});
