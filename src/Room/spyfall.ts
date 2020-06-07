import Room from '../room';
import Player from '../player';

const TIME_PADDING = 5;
const TIME_LIMIT = 60 * 8 + TIME_PADDING;
export default class SpyfallRoom extends Room {
  timeRemaining: number = 0;

  constructor(roomname: string, host: Player) {
    super(roomname, host);
    this.timeRemaining = TIME_LIMIT;
  }

  begin() : number {
    super.begin();
    return this.timeRemaining;
  }

  end() {
    super.end();
  }
}