import Room, {GAMESTARTED} from '../room';
import Player, { getRandomInt } from '../player';
import { v4 as uuid } from 'uuid';
import io from 'socket.io';

export enum ROLES {
  VILLAGER,
  DETECTIVE,
  MEDIC,
  MAFIA,
  GODFATHER,
  SK,
  JOKER,
  NUM_ROLES,
};

function interpretRole(role: ROLES) {
  switch(role) {
    case ROLES.VILLAGER: {
      return 'VILLAGER';
    }
    case ROLES.DETECTIVE: {
      return 'DETECTIVE';
    }
    case ROLES.MEDIC: {
      return 'MEDIC';
    }
    case ROLES.MAFIA: {
      return 'MAFIA';
    }
    case ROLES.GODFATHER: {
      return 'GODFATHER';
    }
    case ROLES.SK: {
      return 'SERIAL KILLER';
    }
    case ROLES.JOKER: {
      return 'JOKER';
    }
    default: {
      return 'VILLAGER';
    }
  }
}

export enum AUDIENCE {
  NOBODY,
  EVERYONE, 
  MAFIA, 
};

export type mafiaProfile = {
  role: ROLES,
  isAlive: boolean,
  numVotes: number,
  votingFor: number,
  targetOfPower: number,
  guiltyDecision: string,
}

export type nightResult = {
  wasAttacked : boolean,
  wasSaved : boolean,
  audience: AUDIENCE,
  phase: number,
  message : string,
  playerRoles?: ROLES[],
};

function getNumMafia(numMafia: number, numMembers: number) : number {
  if (numMafia >= 0) {
    return numMafia;
  }
  if (numMembers < 7) {
    return 1;
  }
  if (numMembers < 12) {
    return 2;
  }
  if (numMembers < 18) {
    return 3;
  }
  return 4;
}

function getHalf(number: number) : number {
  return Math.floor((number) / 2) + 1;
}

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

function isDay(phase: number) {
  return phase % 2 === 0;
}

function printExists(item: any, itemname: string) {
  if (item) {
    console.log(`${itemname} exists`);
  }
  else {
    console.log(`${itemname} does not exist`);
  }
}

function getMafiaTarget(mafiaTargets: number[]) : number {
  const frequency: Map<number, number> = new Map<number, number>();
  let currentMaxCount = 0;
  
  mafiaTargets.forEach(index => {
    let val = 1;
    if (!frequency.has(index)) {
      frequency.set(index, val);
    }
    else {
      val = frequency.get(index)!+1;
      frequency.set(index, val);
    }

    if (val > currentMaxCount) {
      currentMaxCount = val;
    }
  });

  const counts: any[] = [];
  frequency.forEach((value, key) => {
    if (value === currentMaxCount) {
      counts.push(key);
    }
  });
  return counts[getRandomInt(counts.length)];
}

const ABSTAIN: number = -2;
const UNDECIDED: number = -1;
const RECAP_TIME = 3;
const VOTE_GUILTY_TIME = 10;
const MAX_NO_CHANGE_LIMIT = 3; // 3 day/night cycles.

export default class MafiaRoom extends Room {
  /**
   * User controlled settings
   */
  dayTimeLimit: number = 300;
  nightTimeLimit: number = 60;
  defenseTimeLimit: number = 20;
  numMafia: number = 2;
  allowSK: boolean = false;
  allowJoker: boolean = false;

  /** An array. Each index corresponds to a role, and the value corresponds to quantity of alive in that role. */
  alive: Array<number> = [];
  /** Tracks the day/night and number. */
  phase: number = 0;
  /** Used closely with phase. Gives a brief chance to update player's on information before action continues. */
  isRecapPeriod: boolean = false;
  /** The main clock at the center top of the page. Limit set via dayTimeLimit or nightTimeLimit (based on phase) */
  mainTimeRemaining: number = 0;
  /** Interval used to control the main clock. */
  mainInterval: NodeJS.Timeout | null = null;
  secondaryTimeRemaining: number = 0;
  secondaryInterval: NodeJS.Timeout | null = null;
  mafiaRoomId: string;
  numAbstain: number = 0;
  onTrial: number = 0;
  isDefending: boolean = false;
  nightRecap: any[] = [];

  memberProfiles: Array<mafiaProfile> = [];
  playerRoles: ROLES[] = [];
  isGameOver: boolean = false;
  numConsecutiveDaysWithoutDeath: number = 0;
  prevNumAlive: number = 0;

  get numAlive() : number {
    let num = 0;
    this.alive.forEach(val => {
      num += val;
    })
    return num;
  }
  get numAliveVillagers() : number {
    return this.alive[ROLES.VILLAGER] + this.alive[ROLES.DETECTIVE] + this.alive[ROLES.MEDIC];
  }
  get numAliveMafia() : number {
    return this.alive[ROLES.MAFIA] + this.alive[ROLES.GODFATHER];
  }
  
  setMafiaSettings(mafiaSettings: any) {
    const {
      dayTimeLimit, 
      nightTimeLimit,
      defenseTimeLimit,
      numMafia,
      allowSK,
      allowJoker,
    } = mafiaSettings;
    

    this.dayTimeLimit = Number.parseInt(dayTimeLimit);
    this.nightTimeLimit = Number.parseInt(nightTimeLimit);
    this.defenseTimeLimit = Number.parseInt(defenseTimeLimit);
    this.numMafia = Number.parseInt(numMafia);
    this.allowSK = allowSK;
    this.allowJoker = allowJoker;
  }

  constructor(roomId: string, host: Player, server: io.Server, settings: any) {
    super(roomId, host, server, 'mafia');
    const { 
      isPrivate, 
      mafia,
    } = settings;

    this.isPrivate = isPrivate;
    this.mafiaRoomId = uuid();
    this.setMafiaSettings(mafia);
    for(let i=0; i<ROLES.NUM_ROLES; i++) {
      this.alive.push(0);
    }
  }

  updateSettings(settings: any) : any {
    const { 
      mafia
    } = settings;

    this.setMafiaSettings(mafia);

    return { 
      isPrivate: this.isPrivate, 
      mafia,
    };
  }

  getSettings() : object {
    return {
      isPrivate: this.isPrivate, 
      mafia: {
        dayTimeLimit: this.dayTimeLimit, 
        nightTimeLimit: this.nightTimeLimit,
        defenseTimeLimit: this.defenseTimeLimit,
        numMafia: this.numMafia,
        allowSK: this.allowSK,
        allowJoker: this.allowJoker,
      }
    }
  }

  /**
   * Initialize profiles
   * 
   * Initializes numAbstain
   */
  begin() : any {
    super.begin();

    this.numAbstain = 0;
    this.secondaryTimeRemaining = this.defenseTimeLimit;
    this.isRecapPeriod = true;

    const targetNumMafia = getNumMafia(this.numMafia, this.members.length);
    this.alive[ROLES.MAFIA] = targetNumMafia;

    const roles: ROLES[] = [];
    roles.length = this.members.length;
    // Put in numMafia roles
    for(var i = 0; i<targetNumMafia; i++) {
      roles[i] = ROLES.MAFIA;
    }

    // Put in 1 detective and 1 medic
    roles[targetNumMafia] = ROLES.DETECTIVE;
    roles[targetNumMafia+1] = ROLES.MEDIC;
    this.alive[ROLES.DETECTIVE] = 1;
    this.alive[ROLES.MEDIC] = 1;


    // Fill in the rest with villager role
    for(var i=targetNumMafia+2; i<roles.length; i++) {
      roles[i] = ROLES.VILLAGER;
      this.alive[ROLES.VILLAGER]++;
    }

    // If we are using a SK, just put him in the last location
    if (this.allowSK) {
      roles[roles.length-1] = ROLES.SK;
      this.alive[ROLES.SK] = 1;
    }
    // If we are using joker put him in second to last location.
    if (this.allowJoker) {
      roles[roles.length-2] = ROLES.JOKER;
      this.alive[ROLES.JOKER] = 1;
    }
    
    // Shuffle all the roles. The new index corresponds to the players position
    shuffle(roles);

    const profiles: mafiaProfile[] = [];
    // Intializes all the profiles
    roles.forEach((role, index) => {
      const profile = {
        role: role,
        isAlive: true,
        numVotes: 0,
        targetOfPower: -1,
        votingFor: -1,
        guiltyDecision: '',
      }
      if (role === ROLES.MAFIA) {
        if (index < this.members.length) {
          const player = this.members[index];
          player.socket?.join(this.mafiaRoomId);
        }
      }
      profiles.push(profile);
    });
    this.playerRoles = roles; 

    this.mainTimeRemaining = 2; // Phase 0 will have 5 seconds.
    this.isRecapPeriod = true;
    const invalidIndices: Array<number> = [];
    const baseGameState = {
      time: this.mainTimeRemaining,
      role: ROLES.VILLAGER,
      roleCount: {
        mafiaCount: targetNumMafia,
        villagerCount: (roles.length-targetNumMafia)
      },
      numPlayers: this.numAlive,
      invalidIndices,
    }

    this.members.forEach((member, index) => {
      const socket = member.socket;
      let myInvalidIndices: Array<number> = [];

      const playerRole = profiles[index].role;
      if (playerRole === ROLES.DETECTIVE) {
        myInvalidIndices = [index];
      }

      if (socket) {
        baseGameState.role = profiles[index].role;
        baseGameState.invalidIndices = myInvalidIndices;
        socket.emit(GAMESTARTED, baseGameState);
      }
    });
    this.memberProfiles = profiles;

    // Create a repeating interval. This server will synchronize the clocks for all clients.
    this.beginMainTime();
  }

  /**
   * Performs clean up of the mafia room
   */
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
    this.phase = 0;
    this.memberProfiles = [];
    this.playerRoles = [];
    for(let i=0; i<ROLES.NUM_ROLES; i++) {
      this.alive[i] = 0;
    }
  }

  endDay() {
    this.mainTimeRemaining = 0;
    //force the recap period to be shown to hopefully prevent starting a trial *fingers crossed*
    this.server.to(this.roomId).emit('mainTimeUpdate', [this.phase, RECAP_TIME, true]);
    if(!this.mainInterval) {
      this.mainInterval = setInterval(() => this.sendTime(), 1000);
    }
  }
  /**
   * Stop the main sendTime function interval.
   */
  pauseMainTime() {
    if (this.mainInterval) {
      clearInterval(this.mainInterval);
      this.mainInterval = null;
    }
    this.server.to(this.roomId).emit('secondaryTimeUpdate', [this.phase, this.secondaryTimeRemaining, this.isDefending]);
    this.secondaryInterval = setInterval(() => this.secondarySendTime(), 1000);
  }

  beginMainTime() {
    this.server.to(this.roomId).emit('mainTimeUpdate', [this.phase, this.mainTimeRemaining, this.isRecapPeriod]);
    this.mainInterval = setInterval(() => this.sendTime(), 1000);
  }

  resumeMainTime() {
    if (this.secondaryInterval) {
      clearInterval(this.secondaryInterval);
      this.secondaryInterval = null;
    }
    this.beginMainTime();
  }

  /**
   * Sends the secondary time (court duration) to all the players.
   */
  secondarySendTime() {
    // Interval calls.
    this.secondaryTimeRemaining -= 1;
    if(this.secondaryTimeRemaining === -1) {
      if(this.isDefending) {
        this.secondaryTimeRemaining = VOTE_GUILTY_TIME;
        this.isDefending = false;
      }
      else {
        if(this.secondaryInterval) {
          clearInterval(this.secondaryInterval);
        }
        this.sendCourtResult();
      }
    }
    this.server.to(this.roomId).emit('secondaryTimeUpdate', [this.phase, this.secondaryTimeRemaining, this.isDefending]);
  }

  trackInteractionRequest(myIndex: number, targetIndex: number) {
    const myProfile = this.memberProfiles[myIndex];
    const myPlayer = this.members[myIndex];
    const targetProfile = this.memberProfiles[targetIndex];
    const targetPlayer = this.members[targetIndex];
    const oldTarget = myProfile.targetOfPower;
    let message = '';
    if (oldTarget === -1) {
      message = `${myPlayer.username} is targeting ${targetPlayer.username}`;
      myProfile.targetOfPower = targetIndex;
    }
    else if(oldTarget === targetIndex) { //clicking on same guy twice
      message = `${myPlayer.username} is no longer targeting ${targetPlayer.username}`;
      myProfile.targetOfPower = -1;
    }
    else {
      const oldTargetPlayer = this.members[oldTarget];
      message = `${myPlayer.username} switched targets from ${oldTargetPlayer.username} to ${targetPlayer.username}`;
      myProfile.targetOfPower = targetIndex;
    }
    
    const baseObj = {
      audience: AUDIENCE.NOBODY,
      message,
      phase: this.phase,
      myIndex,
      targetIndex: myProfile.targetOfPower,
    }
    if (myProfile.role === ROLES.MAFIA) {
      baseObj.audience = AUDIENCE.MAFIA;
      this.server.to(this.mafiaRoomId).emit('usedPower', baseObj);
    }
    else {
      myPlayer.emit('usedPower', baseObj);
    }
  }

  checkGameOver() {
    // console.log(`Phase:[${this.phase}] -- NumAlive:[${this.numAlive}]`);
    let winners: Set<ROLES> = new Set();
    if (this.numAliveVillagers === 0) {
      this.isGameOver = true;
      winners.add(ROLES.MAFIA);
      winners.add(ROLES.GODFATHER);
    }
    else if (this.numAliveMafia === 0) {
      this.isGameOver = true;
      winners.add(ROLES.VILLAGER);
      winners.add(ROLES.DETECTIVE);
      winners.add(ROLES.MEDIC);
    }

    if(winners.size > 0) {
      this.isGameOver = true;
      if (this.mainInterval) {clearInterval(this.mainInterval);}
      if (this.secondaryInterval) {clearInterval(this.secondaryInterval);}

      // Retrieve all the winners in the first pass
      const winnerPlayers: number[] = [];
      this.memberProfiles.forEach((profile, index) => {
        if (winners.has(profile.role)) {
          winnerPlayers.push(index);
        }
      });

      const obj = {
        audience: AUDIENCE.NOBODY,
        message: 'You have won!',
        phase: this.phase,
        winners: winnerPlayers,
        playerRoles: this.playerRoles,
      }
      // Inform all the winners in the second pass.
      this.memberProfiles.forEach((profile, index) => {
        const player = this.members[index];
        if (winners.has(profile.role)) {
          obj.message = 'You have won!';
        }
        else {
          obj.message = 'You have lost. Better luck next time!';
        }
        player.emit('gameOver', obj);
      })
    }
  }
  killIndex(index: number) {
    const player = this.members[index];
    const profile = this.memberProfiles[index];
    this.alive[profile.role]--;

    const message = `${player.username} was killed to speed up the game!`;
    let playerRoles: ROLES[] = [];
    const obj = {
      index,
      audience: AUDIENCE.EVERYONE,
      message,
      phase: this.phase,
      playerRoles,
    }
    player.socket?.to(this.roomId).emit('playerKilled', obj);
    obj.playerRoles = this.playerRoles;
    player.emit('playerKilled', obj);
  }

  killRandomVillager() {
    const options: number[] = [];

    this.memberProfiles.forEach((profile, index) => {
      if(profile.role === ROLES.VILLAGER || profile.role === ROLES.DETECTIVE || profile.role === ROLES.MEDIC) {
        options.push(index);
      }
    });

    this.killIndex(options[getRandomInt(options.length)]);
  }

  interactionResults() {
    const mafiaTargets: Array<number> = [];
    let detectiveTarget = -1;
    let detectiveTargetRole: ROLES = ROLES.VILLAGER;
    let medicTarget = -1;
    this.memberProfiles.forEach(profile => {
      if (profile.role === ROLES.DETECTIVE) {
        detectiveTarget = profile.targetOfPower;
        if (detectiveTarget> -1) {
          detectiveTargetRole = this.memberProfiles[detectiveTarget].role;
        }
      }
      else if (profile.role === ROLES.MEDIC) {
        medicTarget = profile.targetOfPower;
      }
      else if (profile.role === ROLES.MAFIA) {
        mafiaTargets.push(profile.targetOfPower);
      }
      profile.targetOfPower = -1;
    });

    const mafiaTarget = getMafiaTarget(mafiaTargets);
    
    let checkGameIsOver = false;
    this.members.forEach((player, index) => {
      let roleOfTarget: string | undefined = undefined;
      let message = '';
      let privateMessage = '';
      const result: nightResult = {
        wasAttacked: index === mafiaTarget,
        wasSaved: index === medicTarget,
        audience: AUDIENCE.NOBODY,
        message: privateMessage,
        phase: this.phase,
      };

      const profile = this.memberProfiles[index];
      const profileRole = profile.role;
      if (profileRole === ROLES.DETECTIVE && detectiveTarget>-1) {
        roleOfTarget = `${this.members[detectiveTarget].username} is ${interpretRole(detectiveTargetRole)}`;
      }
      if (result.wasAttacked && !result.wasSaved) {
        profile.isAlive = false;
        this.alive[profileRole]--;
        result.playerRoles = this.playerRoles;
        
        message = `${player.username} was attacked and killed!`;
        privateMessage = 'You were attacked and killed!';
      }
      else if(result.wasAttacked && result.wasSaved) {
        message = `${player.username} was attacked but then saved!`;
        privateMessage = 'You were attacked but then saved!'
      }
      else if(result.wasSaved) {
        message = `${player.username} was saved... from nothing ...`;
        privateMessage = 'You were saved, but no one had attacked you.';
      }

      
      if(roleOfTarget) {
        player.emit('mafiaChatUpdated', {
          audience: AUDIENCE.NOBODY,
          phase: this.phase, 
          message: roleOfTarget,
        });
      }
      if (Boolean(message)) {
        const wasKilled = result.wasAttacked && !result.wasSaved;
        this.nightRecap.push({
          index,
          audience: AUDIENCE.EVERYONE,
          message,
          wasKilled,
          killedRole: wasKilled ? profileRole :  '',
        });
        result.message = privateMessage;
        player.emit('nightResult', result);
      }
    });
  }

  emitPublicInteractionResults() {
    const events = this.nightRecap;
    events.forEach(event => {
      const {
        index,
        wasKilled,
      } = event;
      event.phase = this.phase;

      const player = this.members[index];
      player.socket?.to(this.roomId).emit('publicNightResult', event);
      if (wasKilled) {
        event = {
          ...event,
          playerRoles: this.playerRoles,
        };
      }
      player.emit('publicNightResult', event);
      
    });
    this.nightRecap = [];
  }
  sendCourtResult() {
    let numGuiltyVotes = 0;
    let numNotGuiltyVotes = 0; 

    this.memberProfiles.forEach(profile => {
      if(profile.guiltyDecision !== '') {
        if(profile.guiltyDecision[0] === 'g') {
          numGuiltyVotes++;
        }
        else {
          numNotGuiltyVotes++;
        }
      }
    });

    const trialPlayer = this.members[this.onTrial];
    const trialProfile = this.memberProfiles[this.onTrial];
    const playerRoles: ROLES[] = [];
    let message = '';
    if (numGuiltyVotes > numNotGuiltyVotes) {
      trialProfile.isAlive = false;
      this.alive[trialProfile.role]--;
      
      message = `${trialPlayer.username} was voted to be killed!`;
    }
    else {
      message = `${trialPlayer.username} was spared!`;
    }
    const obj = {
      message,
      audience: AUDIENCE.EVERYONE,
      phase: this.phase,
      isAlive: trialProfile.isAlive,
      killedRole: !trialProfile.isAlive ? trialProfile.role : -1,
      killedIndex: this.onTrial,
      playerRoles: [-1],
    };
    trialPlayer.socket?.to(this.roomId).emit('courtResult', obj);
    if (!trialProfile.isAlive) {
      obj.playerRoles = this.memberProfiles.map(profile => profile.role);
    }
    trialPlayer.emit('courtResult', obj);
    // if (playerKilled)
    trialProfile.numVotes = 0;
    if (!trialProfile.isAlive) {
      this.endDay();
    }
    else {
      this.clearVotes();
      this.resumeMainTime();
    }
  }

  clearVotes() {
    this.memberProfiles.forEach(profile => {
      profile.guiltyDecision = '';
      if (profile.votingFor === this.onTrial) {
        profile.votingFor = -1;
      }
    });
    this.onTrial = -1;
  }
  
  voteGuilty(myIndex: number, decision: string) {
    const myPlayer = this.members[myIndex];
    const myProfile = this.memberProfiles[myIndex];
    const oldDecision = myProfile.guiltyDecision;

    let message = '';
    if (oldDecision === '') {
      myProfile.guiltyDecision = decision;
      if (decision[0] === 'g') {
        message = `${myPlayer.username} voted Guilty.`;
      }
      else { //if(decision[0] === 'n')
        message = `${myPlayer.username} voted Not Guilty.`;
      }
    }
    else if (oldDecision[0] === 'g') {
      if(decision[0] === 'g') {
        myProfile.guiltyDecision = '';
        message = `${myPlayer.username} is no longer voting.`;
      }
      else { //if(decision[0] === 'n')
        myProfile.guiltyDecision = decision;
        message = `${myPlayer.username} switched from Guilty to Not Guilty.`;
      }
    }
    else if (oldDecision[0] === 'n') {
      if(decision[0] === 'n') {
        myProfile.guiltyDecision = '';
        message = `${myPlayer.username} is no longer voting.`;
      }
      else { //if(decision[0] === 'g')
        myProfile.guiltyDecision = decision;
        message = `${myPlayer.username} switched from Not Guilty to Guilty.`;
      }
    }

    const baseObj = {
      audience: AUDIENCE.EVERYONE,
      phase: this.phase,
      message,
      newDecision: myProfile.guiltyDecision,
      oldDecision: oldDecision,
    };
    myPlayer.socket?.to(this.roomId).emit('otherPlayerVotedGuiltyDecision', baseObj);
    myPlayer.emit('iVotedGuiltyDecision', baseObj);
  }

  /**
   * Sends the current time remaining for the session to all players
   */
  sendTime() {
    // Interval calls.
    this.mainTimeRemaining -= 1;
    let emitIndividualNightResults = false;
    let emitPublicNightResults = false;
    if(this.mainTimeRemaining === -1) {
      if (this.isRecapPeriod) {
        this.isRecapPeriod = false;
        this.phase++;
        if (this.phase % 2 === 1) { // is now night
          this.mainTimeRemaining = this.nightTimeLimit;
        }
        else { // is day
          if (this.dayTimeLimit < 0) { // infinitely long daytime
            if (this.mainInterval) {
              clearInterval(this.mainInterval);
              this.mainInterval = null;
              setTimeout(() => {
                this.server.to(this.roomId).emit('mainTimeUpdate', [this.phase, 0, this.isRecapPeriod]);
              }, 1000);
            }
          }
          // Clear out the profiles before daytime starts
          this.memberProfiles = this.memberProfiles.map(profile => {
            return {
              role: profile.role,
              isAlive: profile.isAlive,
              numVotes: 0,
              votingFor: -1,
              targetOfPower: -1,
              guiltyDecision: '',
            };
          });
          this.mainTimeRemaining = this.dayTimeLimit;
          emitPublicNightResults = true;
        }
      }
      else {
        this.isRecapPeriod = true;
        this.mainTimeRemaining = RECAP_TIME;
        if (this.phase %2 === 1) { //is recapping night
          emitIndividualNightResults = true;
          this.numAbstain = 0;
        }
        else { //is recapping day
          if (this.prevNumAlive === this.numAlive) {
            this.numConsecutiveDaysWithoutDeath++;
            if (this.numConsecutiveDaysWithoutDeath === MAX_NO_CHANGE_LIMIT) {
              this.killRandomVillager();
              this.numConsecutiveDaysWithoutDeath = 0;
            }
          }
          else {
            this.prevNumAlive = this.numAlive;
            this.numConsecutiveDaysWithoutDeath = 0;
          }
        }
        this.checkGameOver();
      }
    }
    this.server.to(this.roomId).emit('mainTimeUpdate', [this.phase, this.mainTimeRemaining, this.isRecapPeriod]);
    if (emitIndividualNightResults) {
      this.interactionResults();
    }
    else if(emitPublicNightResults) {
      this.emitPublicInteractionResults();
      this.checkGameOver();
    }
  }

  /**
   * Votes for a player during the day phase and updates the chat history.
   * @param myIndex the index of the player voting
   * @param targetIndex the target of the vote
   */
  votePlayer(myIndex: number, targetIndex: number) {
    const myPlayer = this.members[myIndex];
    const myProfile = this.memberProfiles[myIndex];

    const oldTarget = myProfile.votingFor;
    let message = '';
    let checkAbstain = false;
    let checkVotes = -1;
    // 4 cases
    // 1) myPlayer is abstaining
    // 2) myPlayer is voting for someone fresh
    // 3) myPlayer is removing their vote for a player
    // 4) myPlayer is switching their vote
    if (targetIndex === ABSTAIN) {
      if(oldTarget === ABSTAIN) {
        this.numAbstain--;
        message = `${myPlayer.username} is no longer abstaining.`;
        myProfile.votingFor = UNDECIDED;
      }
      else if(oldTarget === UNDECIDED) {
        this.numAbstain++;
        message = `${myPlayer.username} is choosing to abstain.`;
        myProfile.votingFor = ABSTAIN;
        checkAbstain = true;
      }
      else { //oldTarget was player
        const oldTargetPlayer = this.members[oldTarget];
        const oldTargetProfile = this.memberProfiles[oldTarget];
        oldTargetProfile.numVotes--;

        this.numAbstain++;
        message = `${myPlayer.username} switched from voting ${oldTargetPlayer.username} to abstaining.`;
        myProfile.votingFor = ABSTAIN;
        checkAbstain = true;
      }
    }
    else {
      const targetPlayer = this.members[targetIndex];
      const targetProfile = this.memberProfiles[targetIndex];
      if (oldTarget === ABSTAIN) {
        myProfile.votingFor = targetIndex;
        targetProfile.numVotes++;
        this.numAbstain--;
        message = `${myPlayer.username} switched from abstaining to voting for ${targetPlayer.username}.`;
        checkVotes = targetIndex;
      }
      else if (oldTarget === UNDECIDED) {
        myProfile.votingFor = targetIndex;
        targetProfile.numVotes++;
        message = `${myPlayer.username} is voting for ${targetPlayer.username}.`;
        checkVotes = targetIndex;
      }
      else if(oldTarget === targetIndex) {
        myProfile.votingFor = UNDECIDED;
        targetProfile.numVotes--;
        message = `${myPlayer.username} is no longer voting for ${targetPlayer.username}.`;
      }
      else {
        const oldTargetPlayer = this.members[oldTarget];
        const oldTargetProfile = this.memberProfiles[oldTarget];
        oldTargetProfile.numVotes--;
        
        myProfile.votingFor = targetIndex;
        targetProfile.numVotes++;
        message = `${myPlayer.username} switched vote from ${oldTargetPlayer.username} to ${targetPlayer.username}.`;
        checkVotes = targetIndex;
      }
    }
    const baseObj = {
      audience: AUDIENCE.EVERYONE,
      phase: this.phase,
      message,
      newTarget: myProfile.votingFor,
      oldTarget,
    };
    myPlayer.socket?.to(this.roomId).emit('otherPlayerVotedMafia', baseObj);
    myPlayer.emit('iVotedMafia', baseObj);

    const numNeeded = getHalf(this.numAlive);
    
    if(checkAbstain && this.numAbstain >= numNeeded) {
      this.endDay();
      this.server.to(this.roomId).emit('mafiaChatUpdated', {
        audience: AUDIENCE.EVERYONE,
        phase: this.phase,
        message: `Voting abstained.`
      });
    }
    if(checkVotes !== -1) {
      const targetPlayerName = this.members[targetIndex].username;
      const targetProfile = this.memberProfiles[targetIndex];
      if (targetProfile.numVotes >= numNeeded) {
        this.onTrial = targetIndex;
        const baseObj = {
          audience: AUDIENCE.EVERYONE,
          phase: this.phase,
          name: targetPlayerName,
          onTrial: this.onTrial,
        };
        this.server.to(this.roomId).emit('beginTrial', baseObj);
        this.secondaryTimeRemaining = this.defenseTimeLimit;
        this.isDefending = true;
        this.pauseMainTime();
      }
    }
  }

  /**
   * Sends a message in the chat history and updates all relevant parties of the message
   * @param index The index of the player sending a message 
   * @param userId The user id of the player sending a message
   * @param message The message the player sent
   */
  updateChat(index: number, userId: string, message: string) {
    const player = this.members[index];
    const profile = this.memberProfiles[index];
    if (player.userId !== userId) {
      console.log('out of order!');
    }
    const tagMessage = `${player.username}: ${message}`;
    const baseObj = {
      audience: AUDIENCE.EVERYONE,
      phase: this.phase,
      message: tagMessage,
    };

    
    // If it's day time, make message publicly available
    if (isDay(this.phase)) {
      this.server.to(this.roomId).emit('mafiaChatUpdated', baseObj);
    }
    else {
      // Different scenarios for texting at night
      if(profile.role === ROLES.MAFIA) {
        // If player is a mafia, send to all mafias.
        baseObj.audience = AUDIENCE.MAFIA;
        this.server.to(this.mafiaRoomId).emit('mafiaChatUpdated', baseObj);
      }
      else {
        // Otherwise just update the player's individual chat message. 
        baseObj.audience = AUDIENCE.NOBODY;
        player.emit('mafiaChatUpdated', baseObj);
      }
    }
  }
}