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
  /** The unique id for the room. Genereated upon creation. */
  roomId: string;
  /** The type of game this room is being used for. Intended use case = handling joining games from a different game type */
  roomType: string;
  /** An array of all the players that will be in the game when host starts */
  members: Array<Player>;
  /** The number of people present when game is started. Used to track how many people have disconnected. */
  totalNumPlayers: number = 0;
  /** 
   * The list of people that join after the host has started the game. When the host returns to lobby, 
   * these players are automatically added to the members list
   */
  spectators: Array<Player>;
  /**  A `roomId` to allow server to communicate with the spectators without interrupting the members */
  spectatorChannel: string;
  /** A flag set to determine whether the game has started */
  currentlyInGame: boolean = false;
  /** A setting common to all rooms. If it is private, the room will not be listed available and a roomId must be used.  */
  isPrivate: boolean = false;
  /** The server this room is in. */
  server: io.Server;

  /**
   * Creates a new Room object
   * @param roomId the room id for this room
   * @param host the player who is creating this room
   * @param server the server in which this room will be created.
   * @param roomType the type of game this room will be used for
   */
  constructor(roomId: string, host: Player, server: io.Server, roomType: string) {
    this.roomId = roomId;
    this.spectatorChannel = `${roomId}-spectator`;
    host.roomId = roomId;
    this.members = [host];
    this.spectators = [];
    this.roomType = roomType;
    this.server = server;
  }

  /** Gets the first player in the list */
  get host() : Player {
    return this.members[0];
  }
  
  /**
   * Allows hosts to update settings by providing an object listing all the new settings.
   * @param settings Object listing all the game settings the player wants to use
   */
  updateSettings(settings:any) {
    // Set is private eventually
  }
  /** 
   * Overloaded by subclasses.
   * @returns an object containing all the settings used by the specific game type. 
   */
  getSettings() : object {
    // prototyping for subclasses to use
    return {};
  }
  /**
   * @returns The list of players in the room as well as the room id.
   */
  getRoomInfo() : LobbyRoomInfo {
    return {
      members: getPlayerNames(this.members),
      roomId: this.roomId,
    };
  }

  /**
   * @todo Implement privacy switching.
   * Currently not supported.
   */
  togglePrivate() : boolean {
    this.isPrivate = !this.isPrivate;
    return this.isPrivate;
  }

  /**
   * Used when generating the list of available rooms. 
   * @returns an object containing a concise list of info about this room
   */
  getConciseRoomInfo() : ConciseRoomInfo {
    return {
      hostname: this.members[0].username,
      numPlayers: this.members.length,
      roomId: this.roomId,
      isPrivate: this.isPrivate,
    };
  }

  /**
   * Handles all the logic for adding a player to this room
   * 
   * @param player The player to be added
   */
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

  /**
   * Remove a player
   * @param player the player to remove
   */
  removePlayer(player: Player) : boolean {
    // If players are in the game, we do not want to screw around with the indexing situation of members.
    // Check if the player exists in the spectator list
    if (this.currentlyInGame) {
      let index = this.spectators.indexOf(player);
      if (index > -1) {
        player.socket?.leave(this.spectatorChannel);
        this.spectators.splice(index, 1);
        player.roomId = '';
        this.server.to(this.spectatorChannel).emit('spectatorLeft', index);
      }
      else {
        index = this.members.indexOf(player);
        if(index > -1) {
          this.totalNumPlayers--;
          if (this.totalNumPlayers === 0) {
            return true;
          }
        }
      }
      return false;
    }

    let shouldDeleteRoom = false;
    let index = 0;
    player.socket?.leave(this.roomId);
    // Delete the player from the room, and return the index of where they were in the room. 
    if(this.host === player) {
      shouldDeleteRoom = this.removeHost();
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
    return shouldDeleteRoom;
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
    this.totalNumPlayers = this.members.length;
  }

  end() {
    this.currentlyInGame = false;
  }

  returnToLobby(nameSpaceToRooms: Map<string, Room[]>) {
    this.server.to(this.roomId).emit('sentBackToLobby');
    this.addSpectatorsToLobby();
    this.clearInactivePlayers();
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
  clearInactivePlayers() {
    for(var i = 0; i<this.members.length; i++) {
      const player = this.members[i];
      if(player.disconnectTime > 0) { // are disconnected
        this.removePlayer(player);
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
    this.server.to(this.spectatorChannel).emit('roomClosed');
    this.spectators.forEach(player => {
      player.socket?.leave(this.spectatorChannel);
    });
  }
}