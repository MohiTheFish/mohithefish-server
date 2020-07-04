import Room, {GAMESTARTED} from '../room';
import Player, {getRandomInt} from '../player';

import io from 'socket.io';

const TIME_PADDING = 0;

const locations = [
  'Airplane',
  'Bank',
  'Beach',
  'Cathedral',
  'Circus Tent',
  'Corporate Party',
  'Cruise Ship',
  'Crusader Army',
  'Casino',
  'Day Spa',
  'Embassy',
  'Gas Station',
  'Hospital',
  'Hotel',
  'Military Base',
  'Movie Studio',
  'Passenger Train',
  'Pirate Ship',
  'Polar Station',
  'Police Station',
  'Restaurant',
  'School',
  'Space Station',
  'Submarine',
  'Supermarket',
  'Theater',
  'University',
  'World War II Squad'
];

const foods = [
  'Sushi',
  'Burrito', 
  'Doritos',
  'Lays',
  'Pizza',
  'Hamburger',
  'Omelette',
  'Garlic Bread',
  'Salad',
  'Cookie',
  'Brownie',
  'Pie',
  'Fried Rice',
  'Lentils',
  'Eggplant',
  'Orange',
  'Black Beans',
  'Cereal',
  'Mac & Cheese',
  'Taco Bell',
  'Cabbage',
  "Ethan's Dog",
  'Chicken',
  'French Fries',
  'Cake',
  'Unbelievable Meat',
  'Insects',
  'Donuts'
]

const animals = [
  'Dog',
  'Cat',
  'Cow',
  'Chicken',
  'Wildcat',
  'Pig',
  'Turtle',
  'Frog',
  'Shark',
  'Penguin',
  'Polar Bear',
  'Panda Bear',
  'Whale',
  'Rhino',
  'Rabbit',
  'Beaver',
  'Wolf',
  'Lion',
  'Monkey',
  'Dolphin',
  'Kangaroo',
  'Giraffe',
  'Elephant',
  'Kiril',
  'Snake',
  'Goose',
  'Bee',
  'Lizard',
  'Leopard',
  'Hawk',
  'Eagle',
  'Ostrich',
  'Koala',
  'Seal',
  'Hippo', 
  "Ryan's Brain"
]
function getList(gameType: string) : string[] {
  switch(gameType) {
    case 'Foods' : {
      return foods;
    }
    case 'Animals' : {
      return animals;
    }
    default: {
      return locations;
    }
  }
}


export default class SpyfallRoom extends Room {
  maxTime: string;
  timeRemaining: number = 0;
  spyIndex: number = 0;
  roomInterval: any;
  gameType: string = "";

  constructor(roomId: string, host: Player, server: io.Server, settings: any) {
    super(roomId, host, server, 'spyfall');
    
    const { isPrivate, spyfall: {time, gameType}} = settings;
    this.maxTime = time;
    this.gameType = gameType;
    this.isPrivate = isPrivate;
  }

  updateSettings(settings: any) : any {
    const { spyfall: {time, gameType} } = settings;
    this.maxTime = time;
    this.gameType = gameType;

    return {
      isPrivate: this.isPrivate,
      spyfall: {
        time: time,
        gameType: gameType,
      }
    };
  }

  getSettings() : object {
    return {
      isPrivate: this.isPrivate,
      spyfall: {
        time: this.maxTime,
        gameType: this.gameType,
      }
    }
  }

  begin() : any {
    super.begin();
    // Randomly pick a spy
    this.spyIndex = getRandomInt(this.members.length);

    // Convert maxtime to seconds
    this.timeRemaining = parseInt(this.maxTime) * 60 + TIME_PADDING;
    if (this.roomInterval) {
      clearInterval(this.roomInterval);
    }
    // Create a repeating interval. This server will synchronize the clocks for all clients.
    this.roomInterval = setInterval(() => this.sendTime(), 1000);
    
    const list = getList(this.gameType);
    const secretItem = list[getRandomInt(list.length)];
    const gameState = {
      spyIndex: this.spyIndex,
      time: this.timeRemaining,
      locations: getList(this.gameType),
      secretLocation: secretItem,
    };
    this.server.to(this.roomId).emit(GAMESTARTED, gameState);
  }

  end() {
    super.end();
    if(this.roomInterval) {
      clearInterval(this.roomInterval);
      this.roomInterval = null;
    }
  }

  sendTime() {
    // Interval calls.
    this.server.to(this.roomId).emit('mainTimeUpdate', this.timeRemaining);
    this.timeRemaining -= 1;
    if(this.timeRemaining === -1) {
      this.end();
    }
  }
}