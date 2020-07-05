import io from 'socket.io';
import Player from './player';

export const GAMESTARTED: string = 'gameStarted';

export type ConciseRoomInfo = {
  hostname: string,
  numPlayers: number,
  roomId: string,
  isPrivate: boolean,
};

export type LobbyRoomInfo = {
  members: Array<string>,
  roomId: string,
  spectators?: Array<string>,
  settings?: object,
}

// export type LobbySettings = {
//   settings: object,
// };

function getPlayerNames(players: Array<Player>) {
  return players.map(m => m.username);
}

export default class Room {
  roomId: string;
  roomType: string;
  members: Array<Player>;
  spectators: Array<Player>;
  spectatorChannel: string;
  currentlyInGame: boolean = false;
  isPrivate: boolean = false;
  server: io.Server;

  constructor(roomId: string, host: Player, server: io.Server, roomType: string) {
    this.roomId = roomId;
    this.spectatorChannel = `${roomId}-spectator`;
    host.roomId = roomId;
    this.members = [host];
    this.spectators = [];
    this.roomType = roomType;
    this.server = server;
  }

  get host() : Player {
    return this.members[0];
  }

  updateSettings(settings:any) {
    // Set is private eventually
  }
  getSettings() : object {
    // prototyping for subclasses to use
    return {};
  }
  getRoomInfo() : LobbyRoomInfo {
    return {
      members: getPlayerNames(this.members),
      roomId: this.roomId,
    };
  }

  togglePrivate() : boolean {
    this.isPrivate = !this.isPrivate;
    return this.isPrivate;
  }

  getConciseRoomInfo() : ConciseRoomInfo {
    return {
      hostname: this.members[0].username,
      numPlayers: this.members.length,
      roomId: this.roomId,
      isPrivate: this.isPrivate,
    };
  }

  addPlayer(player: Player) : void {
    // If player's room id matches this room id, we are already done.
    if (player.roomId === this.roomId) {return; }
    player.roomId = this.roomId;
    if (this.currentlyInGame) {
      console.log(`Adding Spectator: [${player.username}]`);

      this.spectators.push(player);
      const roomInfo = this.getRoomInfo();
      roomInfo.spectators = getPlayerNames(this.spectators);

      this.server.to(this.spectatorChannel).emit('otherSpectators', roomInfo);

      player.socket?.join(this.spectatorChannel);
      roomInfo.settings = this.getSettings(); // Calls the subclass getSettings
      player.socket?.emit('youSpectated', roomInfo);
    }
    else {
      this.members.push(player);
      const roomInfo = this.getRoomInfo();

      this.server.to(this.roomId).emit('othersJoined', roomInfo);

      player.socket?.join(this.roomId);

      roomInfo.settings = this.getSettings(); //Calls the subClass getSettings
      // Inform original client that they have now joined.
      player.socket?.emit('youJoined', roomInfo);
    }
  }

  deleteRoomFromNamespace(nameSpaceToRooms: Map<string, Room[]>) {
    const rooms: Array<Room> = nameSpaceToRooms.get(this.roomType)!;
    for(let i=0; i<rooms.length; i++){
      const room = rooms[i];
      if (room === this) {
        room.end();
        this.informSpectators();
        rooms.splice(i, 1);
        break;
      }
    }
  }

  deleteHost(nameSpaceToRooms: Map<string, Room[]>) {
    const shouldDeleteRoom = this.removeHost();
    if (shouldDeleteRoom) {
      this.deleteRoomFromNamespace(nameSpaceToRooms);
    }
  }

  removePlayer(player: Player, nameSpaceToRooms: Map<string, Room[]>) {
    // If players are in the game, we do not want to screw around with the indexing situation of members.
    // Check if the player exists in the spectator list
    if (this.currentlyInGame) {
      console.log('remove spectator');
      let index = this.spectators.indexOf(player);
      if (index > -1) {
        player.socket?.leave(this.spectatorChannel);
        this.spectators.splice(index, 1);
        player.roomId = '';
        this.server.to(this.spectatorChannel).emit('spectatorLeft', index);
      }

      return;
    }

    player.socket?.leave(this.roomId);
    let index = 0;
    // Delete the player from the room, and return the index of where they were in the room. 
    if(this.host === player) {
      this.deleteHost(nameSpaceToRooms);
    }
    else {
      index = this.members.indexOf(player);
      if (index > -1) {
        this.members.splice(index, 1);
      }
      player.roomId = "";
    }
    console.log('index of removed player:' + index);
    this.server.to(this.roomId).emit('playerLeft', index);
  }

  removeHost() : boolean {
    if (this.members.length === 1) {
      return true;
    }
    const host = this.members[0];
    host.roomId = "";
    this.members.shift();
    return false;
  }

  begin() {
    this.currentlyInGame = true;
  }

  end() {
    this.currentlyInGame = false;
  }

  returnToLobby(nameSpaceToRooms: Map<string, Room[]>) {
    this.server.to(this.roomId).emit('sentBackToLobby');
    this.addSpectatorsToLobby();
    this.clearInactivePlayers(nameSpaceToRooms);
    this.giveEachPlayerIndex(); // emits 'yourIndex'
    this.server.to(this.roomId).emit('roomReady');
  }

  addSpectatorsToLobby() {
    this.spectators.forEach(player => {
      player.socket?.leave(this.spectatorChannel);
      player.socket?.join(this.roomId);
      this.members.push(player);
    });
    this.spectators = [];
  }
  clearInactivePlayers(nameSpaceToRooms: Map<string, Room[]>) {
    for(var i = 0; i<this.members.length; i++) {
      const player = this.members[i];
      if(player.disconnectTime > 0) { // are disconnected
        this.removePlayer(player, nameSpaceToRooms);
        i--;
      }
    }
  }

  giveEachPlayerIndex() {
    const members = getPlayerNames(this.members);
    this.members.forEach( (member, index) => {
      member.socket?.emit('myIndex', {
        members,
        myIndex: index,
      })
    })
  }

  informSpectators() {
    this.server.to(this.roomId).emit('roomClosed');
  }
}