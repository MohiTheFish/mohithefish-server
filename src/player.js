class Player {
  constructor(data) {
    this.username = data.username;
    this.gamename = data.gamename;
    this.uuid = data.uuid;
    this.disconnectTime = -1;
  }

  disconnectPlayer() {
    this.disconnectTime = Date.now();
  }
}

module.exports = Player;