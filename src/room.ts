export default class Room {
  hostname: string;
  roomname: string;
  members: Array<string>;

  constructor(roomname: string, hostname: string) {
    this.roomname = roomname;
    this.hostname = hostname;
    this.members = [hostname];
  }

  getRoomInfo() {
    return {
      hostname: this.hostname,
      members: this.members,
      roomname: this.roomname,
    };
  }

  addPlayer(name: string) {
    this.members.push(name);
  }

  removePlayer(name: string) {
    const index = this.members.indexOf(name);
    if (index > -1) {
      this.members.splice(index, 1);
    }
  }
}