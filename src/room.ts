export default class Room {
  hostname: string;
  members: Array<string>;
  constructor(hostname: any) {
    this.hostname = hostname;
    this.members = [hostname];
  }

  getRoomInfo() {
    return {
      hostname: this.hostname,
      members: this.members,
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