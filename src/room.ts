import Player from './player';

export default class Room {
  host: Player;
  roomname: string;
  members: Array<Player>;
  num: number = 0;

  constructor(roomname: string, host: Player) {
    this.roomname = roomname;
    this.host = host;
    this.num += 1;
    this.members = [];
  }

  getRoomInfo() {
    let memberNames = this.members.map(m => m.username);
    return {
      hostname: this.host.username,
      members: memberNames,
      roomname: this.roomname,
    };
  }

  getConciseRoomInfo() {
    return {
      hostname: this.host.username,
      numPlayers: this.members.length,
    };
  }

  addPlayer(player: Player) {
    this.members.push(player);
    this.num += 1;
  }

  removePlayer(player: Player) {
    const index = this.members.indexOf(player);
    if (index > -1) {
      this.members.splice(index, 1);
    }
  }

  removeHost() {
    this.hostname = this.members[0];
    this.members.shift();
  }
}