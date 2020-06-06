import Player from './player';

export type ConciseRoomInfo = {
  hostname: string,
  numPlayers: number,
  roomname: string,
};

export default class Room {
  host: Player;
  roomname: string;
  members: Array<Player>;

  constructor(roomname: string, host: Player) {
    this.roomname = roomname;
    this.host = host;
    host.roomname = roomname;
    this.members = [];
  }

  getRoomInfo() : any{
    let memberNames = this.members.map(m => m.username);
    return {
      hostname: this.host.username,
      members: memberNames,
      roomname: this.roomname,
    };
  }

  getConciseRoomInfo() : ConciseRoomInfo {
    return {
      hostname: this.host.username,
      numPlayers: this.members.length,
      roomname: this.roomname,
    };
  }

  addPlayer(player: Player) : void {
    this.members.push(player);
    player.roomname = this.roomname;
  }

  removePlayer(player: Player) : void {
    const index = this.members.indexOf(player);
    if (index > -1) {
      this.members.splice(index, 1);
    }
    player.roomname = "";
  }

  removeHost() : boolean {
    if (this.members.length === 0) {
      return true;
    }
    this.host.roomname = "";
    this.host = this.members[0];
    this.members.shift();
    return false;
  }
}