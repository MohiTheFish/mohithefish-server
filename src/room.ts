export default class Room {
  hostname: string;
  roomname: string;
  members: Array<string>;
  num: number = 0;

  constructor(roomname: string, hostname: string) {
    this.roomname = roomname;
    this.hostname = `${hostname}`;
    this.num += 1;
    this.members = [];
  }

  getRoomInfo() {
    return {
      hostname: this.hostname,
      members: this.members,
      roomname: this.roomname,
    };
  }

  addPlayer(name: string) {
    this.members.push(`${name}`);
    this.num += 1;
  }

  removePlayer(name: string) {
    const index = this.members.indexOf(name);
    if (index > -1) {
      this.members.splice(index, 1);
    }
  }

  removeHost() {
    this.hostname = this.members[0];
    this.members.shift();
  }
}