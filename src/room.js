class Room {
  constructor(hostname) {
    this.hostname = hostname;
    this.members = [hostname];
  }

  addPlayer(name) {
    this.members.push(name);
  }

  removePlayer(name) {
    const index = array.indexOf(name);
    if (index > -1) {
      this.members.splice(index, 1);
    }
  }

}
module.exports = Room;