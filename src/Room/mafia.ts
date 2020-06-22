import Room from '../room';
import Player from '../player';

import { v4 as uuid } from 'uuid';
import io from 'socket.io';

enum ROLES {
  VILLAGER,
  DETECTIVE,
  MEDIC,
  MAFIA,
  GODFATHER,
  SK,
  JOKER,
};

type mafiaProfile = {
  role: ROLES,
  isAlive: boolean,
  votingFor: string,
  isAbstaining: boolean,
  targetOfPower: string,
};

/**
 * Randomly shuffles a given array
 * 
 * Credit to: https://javascript.info/task/shuffle
 * @param array array to shuffle
 */
function shuffle(array: any[]) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1)); // random index from 0 to i

    // swap elements array[i] and array[j]
    // we use "destructuring assignment" syntax to achieve that
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Function to interpret what phase and what number a phase is in
 * 
 * Ex) phase = 0 refers to day 0
 * 
 * Ex) phase = 1 refers to night 1
 * 
 * Ex) phase = 4 refers to day 2
 * @param phase a number indicating the phase
 */
function interpretPhase(phase: number) : string {
  const isEven = phase % 2 === 0;
  if (isEven) {
    const num = phase / 2;
    return `day ${num}`;
  }
  else {
    const num = (phase+1) / 2;
    return `night ${num}`;
  }
}
export default class MafiaRoom extends Room {
  dayTimeLimit: number = 300;
  nightTimeLimit: number = 60;
  defenseTimeLimit: number = 20;

  numMafia: number = 2;
  allowSK: boolean = false;
  allowJoker: boolean = false;
  phase: number = 0;
  mainTimeRemaining: number = 0;
  mainInterval: any = null;
  secondaryTimeRemaining: number = 0;
  secondaryInterval: any = null;
  mafiaRoomId: string;

  memberProfiles: Array<mafiaProfile> = [];

  constructor(roomId: string, host: Player, settings: any) {
    super(roomId, host);
    
    const { 
      isPrivate, 
      mafia: {
        dayTimeLimit, 
        nightTimeLimit,
        defenseTimeLimit,
        numMafia,
        allowSK,
        allowJoker,
      }
    } = settings;

    this.isPrivate = isPrivate;
    this.mafiaRoomId = uuid();

    this.dayTimeLimit = Number.parseInt(dayTimeLimit);
    this.nightTimeLimit = Number.parseInt(nightTimeLimit);
    this.defenseTimeLimit = Number.parseInt(defenseTimeLimit);
    this.numMafia = Number.parseInt(numMafia);
    this.allowSK = allowSK;
    this.allowJoker = allowJoker;
  }

  updateSettings(settings: any) : any {
    const { 
      mafia: {
        dayTimeLimit, 
        nightTimeLimit,
        defenseTimeLimit,
        numMafia,
        allowSK,
        allowJoker,
      }
    } = settings;

    this.dayTimeLimit = Number.parseInt(dayTimeLimit);
    this.nightTimeLimit = Number.parseInt(nightTimeLimit);
    this.defenseTimeLimit = Number.parseInt(defenseTimeLimit);
    this.numMafia = Number.parseInt(numMafia);
    this.allowSK = allowSK;
    this.allowJoker = allowJoker;

    return { 
      isPrivate: this.isPrivate, 
      mafia: {
        dayTimeLimit, 
        nightTimeLimit,
        defenseTimeLimit,
        numMafia,
        allowSK,
        allowJoker,
      }
    };
  }

  getSettings() : any {
    const roomInfo = super.getRoomInfo();
    roomInfo.settings = {
      isPrivate: this.isPrivate, 
      mafia: {
        dayTimeLimit: this.dayTimeLimit, 
        nightTimeLimit: this.nightTimeLimit,
        defenseTimeLImit: this.defenseTimeLimit,
        numMafia: this.numMafia,
        allowSK: this.allowSK,
        allowJoker: this.allowJoker,
      }
    }
    return roomInfo;
  }

  getGameState(myIndex: number) : any{
    const profileInfo: any[] = [];
    profileInfo.length = this.memberProfiles.length;
    this.memberProfiles.forEach((profile,index) => {
      profileInfo[index] = {
        isAlive: profile.isAlive,
      }
    })

    return {
      profileInfo,
    }
  }
  begin(server: io.Server) : any {
    super.begin();

    const numPlayers = this.members.length+1;
    this.memberProfiles = new Array(numPlayers);
    const profiles = this.memberProfiles;

    const roles: ROLES[] = [];
    roles.length = numPlayers;
    // Put in numMafia roles
    for(var i = 0; i<this.numMafia; i++) {
      roles[i] = ROLES.MAFIA;
    }

    // Put in 1 detective and 1 medic
    roles[this.numMafia] = ROLES.DETECTIVE;
    roles[this.numMafia+1] = ROLES.MEDIC;

    // Fill in the rest with villager role
    for(var i=this.numMafia+2; i<roles.length; i++) {
      roles[i] = ROLES.VILLAGER;
    }

    // If we are using a SK, just put him in the last location
    if (this.allowSK) {
      roles[roles.length-1] = ROLES.SK;
    }
    // If we are using joker put him in second to last location.
    if (this.allowJoker) {
      roles[roles.length-2] = ROLES.JOKER;
    }
    
    // Shuffle all the roles. The new index corresponds to the players position
    shuffle(roles);


    // Intializes all the profiles
    profiles.forEach((profile,index) => {
      profile.role = roles[index];
      profile.isAlive = true;
      profile.isAbstaining = false;
      profile.targetOfPower = "";
      profile.votingFor = "";
    });

    this.mainTimeRemaining = 5; // Phase 0 will have 5 seconds.
    // Create a repeating interval. This server will synchronize the clocks for all clients.
    this.mainInterval = setInterval(() => {this.sendTime(server)}, 1000);

    
    
  }

  end() {
    super.end();
    if(this.mainInterval) {
      clearInterval(this.mainInterval);
      this.mainInterval = null;
    }
    if (this.secondaryInterval) {
      clearInterval(this.secondaryInterval);
      this.secondaryInterval = null;
    }
  }

  pauseMainTime(server: io.Server) {
    if (this.mainInterval) {
      clearInterval(this.mainInterval);
      this.mainInterval = null;

      this.secondaryInterval = setInterval(() => {this.secondarySendTime(server)}, 1000);
    }
  }

  secondarySendTime(server: io.Server) {
    // Interval calls.
    server.of('/mafia').to(this.roomId).emit('timeUpdate', this.secondaryTimeRemaining);
    this.secondaryTimeRemaining -= 1;
    if(this.secondaryTimeRemaining === -1) {

      clearInterval(this.secondaryInterval);
    }
  }

  sendTime(server: io.Server) {
    // Interval calls.
    server.of('/mafia').to(this.roomId).emit('timeUpdate', this.mainTimeRemaining);
    this.mainTimeRemaining -= 1;
    if(this.mainTimeRemaining === -1) {
      this.phase += 1;
      if (this.phase % 2 === 1) {
        this.mainTimeRemaining = this.nightTimeLimit;
      }
      else {
        this.mainTimeRemaining = this.dayTimeLimit;
      }
    }
  }
}